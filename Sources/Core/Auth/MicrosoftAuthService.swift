import Foundation
import AuthenticationServices
import UIKit

struct MinecraftAccount: Codable {
    var username: String
    var uuid: String
    var xuid: String?
    var minecraftToken: String
    var minecraftTokenExpiry: Date
    var msaRefreshToken: String
}

/// Full Microsoft → Xbox Live → XSTS → Minecraft services auth chain.
/// Ownership is verified (entitlements/mcstore) — accounts without a Java
/// Edition license are rejected, per Mojang's launcher requirements.
///
/// You must register your own Azure AD application (public client, personal
/// Microsoft accounts) AND have it approved for the Minecraft API scope via
/// Mojang's launcher-partner form; put its client id below. The redirect URI
/// must be registered as mojolauncher://auth (mobile & desktop platform).
@MainActor
final class MicrosoftAuthService: NSObject {
    static let clientID = "00000000-0000-0000-0000-000000000000"   // ← your Azure app id
    private static let redirectURI = "mojolauncher://auth"
    private static let scope = "XboxLive.signin offline_access"

    private let keychain = KeychainStore()
    private let accountKey = "primaryAccount"
    private var webSession: ASWebAuthenticationSession?

    // MARK: Public API

    func restoreSession() throws -> MinecraftAccount? {
        keychain.load(MinecraftAccount.self, key: accountKey)
    }

    func signOut() {
        keychain.delete(key: accountKey)
    }

    /// Interactive sign-in via ASWebAuthenticationSession.
    func signIn() async throws -> MinecraftAccount {
        let code = try await authorizationCode()
        let msa = try await msaToken(body: [
            "client_id": Self.clientID,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": Self.redirectURI,
        ])
        return try await completeChain(msa: msa)
    }

    /// Silent refresh; falls back to the stored account if still valid.
    func refreshIfNeeded(_ account: MinecraftAccount) async throws -> MinecraftAccount {
        guard account.minecraftTokenExpiry < Date().addingTimeInterval(300) else { return account }
        let msa = try await msaToken(body: [
            "client_id": Self.clientID,
            "refresh_token": account.msaRefreshToken,
            "grant_type": "refresh_token",
        ])
        return try await completeChain(msa: msa)
    }

    // MARK: Chain steps

    private struct MSAToken: Decodable {
        let access_token: String
        let refresh_token: String
    }

    private func authorizationCode() async throws -> String {
        var components = URLComponents(string: "https://login.live.com/oauth20_authorize.srf")!
        components.queryItems = [
            .init(name: "client_id", value: Self.clientID),
            .init(name: "response_type", value: "code"),
            .init(name: "redirect_uri", value: Self.redirectURI),
            .init(name: "scope", value: Self.scope),
            .init(name: "prompt", value: "select_account"),
        ]
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: components.url!, callbackURLScheme: "mojolauncher") { url, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let url,
                      let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                          .queryItems?.first(where: { $0.name == "code" })?.value else {
                    continuation.resume(throwing: AuthError.noAuthCode)
                    return
                }
                continuation.resume(returning: code)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.webSession = session
            session.start()
        }
    }

    private func msaToken(body: [String: String]) async throws -> MSAToken {
        try await postForm(url: "https://login.live.com/oauth20_token.srf", form: body)
    }

    private func completeChain(msa: MSAToken) async throws -> MinecraftAccount {
        // 1. Xbox Live user token
        struct XBLResponse: Decodable {
            let Token: String
            let DisplayClaims: Claims
            struct Claims: Decodable { let xui: [XUI] }
            struct XUI: Decodable { let uhs: String; let xid: String? }
        }
        let xbl: XBLResponse = try await postJSON(url: "https://user.auth.xboxlive.com/user/authenticate", body: [
            "Properties": [
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": "d=\(msa.access_token)",
            ],
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT",
        ])

        // 2. XSTS token for the Minecraft relying party
        let xsts: XBLResponse = try await postJSON(url: "https://xsts.auth.xboxlive.com/xsts/authorize", body: [
            "Properties": ["SandboxId": "RETAIL", "UserTokens": [xbl.Token]],
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT",
        ])
        guard let uhs = xsts.DisplayClaims.xui.first?.uhs else { throw AuthError.xstsDenied }

        // 3. Minecraft services token
        struct MCToken: Decodable { let access_token: String; let expires_in: Int }
        let mc: MCToken = try await postJSON(url: "https://api.minecraftservices.com/authentication/login_with_xbox", body: [
            "identityToken": "XBL3.0 x=\(uhs);\(xsts.Token)",
        ])

        // 4. Ownership check — the user must actually own Java Edition.
        struct Entitlements: Decodable {
            struct Item: Decodable { let name: String }
            let items: [Item]
        }
        let owned: Entitlements = try await getJSON(url: "https://api.minecraftservices.com/entitlements/mcstore",
                                                    bearer: mc.access_token)
        guard owned.items.contains(where: { $0.name == "game_minecraft" || $0.name == "product_minecraft" }) else {
            throw LauncherError.notEntitled
        }

        // 5. Profile (username + UUID)
        struct Profile: Decodable { let id: String; let name: String }
        let profile: Profile = try await getJSON(url: "https://api.minecraftservices.com/minecraft/profile",
                                                 bearer: mc.access_token)

        let account = MinecraftAccount(
            username: profile.name,
            uuid: profile.id,
            xuid: xbl.DisplayClaims.xui.first?.xid,
            minecraftToken: mc.access_token,
            minecraftTokenExpiry: Date().addingTimeInterval(TimeInterval(mc.expires_in)),
            msaRefreshToken: msa.refresh_token
        )
        try keychain.save(account, key: accountKey)
        return account
    }

    // MARK: HTTP helpers

    private func postForm<T: Decodable>(url: String, form: [String: String]) async throws -> T {
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = form
            .map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")" }
            .joined(separator: "&")
            .data(using: .utf8)
        return try await send(request)
    }

    private func postJSON<T: Decodable>(url: String, body: [String: Any]) async throws -> T {
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await send(request)
    }

    private func getJSON<T: Decodable>(url: String, bearer: String) async throws -> T {
        var request = URLRequest(url: URL(string: url)!)
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return try await send(request)
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw AuthError.httpError(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    enum AuthError: LocalizedError {
        case noAuthCode
        case xstsDenied
        case httpError(status: Int, body: String)

        var errorDescription: String? {
            switch self {
            case .noAuthCode: return "Sign-in was cancelled."
            case .xstsDenied: return "Xbox Live rejected this account (child account without family consent, or region without Xbox Live)."
            case .httpError(let status, _): return "Authentication failed (HTTP \(status))."
            }
        }
    }
}

extension MicrosoftAuthService: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        DispatchQueue.main.sync {
            UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.keyWindow }
                .first ?? ASPresentationAnchor()
        }
    }
}
