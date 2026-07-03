import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var appState: AppState
    @State private var signingIn = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if let account = appState.account {
                    Section("Signed in") {
                        HStack(spacing: 14) {
                            // Player head from the public Crafatar mirror.
                            AsyncImage(url: URL(string: "https://crafatar.com/avatars/\(account.uuid)?size=80&overlay")) { image in
                                image.resizable()
                            } placeholder: {
                                Color.secondary.opacity(0.2)
                            }
                            .frame(width: 44, height: 44)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            VStack(alignment: .leading) {
                                Text(account.username).font(.headline)
                                Text(account.uuid)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Button("Sign out", role: .destructive) {
                            appState.authService.signOut()
                            appState.account = nil
                        }
                    }
                } else {
                    Section {
                        Button {
                            Task { await signIn() }
                        } label: {
                            HStack {
                                if signingIn { ProgressView().padding(.trailing, 6) }
                                Text("Sign in with Microsoft")
                            }
                        }
                        .disabled(signingIn)
                    } footer: {
                        Text("You need a Microsoft account that owns Minecraft: Java Edition. MojoLauncher stores tokens in the iOS Keychain and talks only to Microsoft, Xbox Live, and Mojang servers.")
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.footnote) }
                }
            }
            .navigationTitle("Account")
        }
    }

    private func signIn() async {
        signingIn = true
        error = nil
        defer { signingIn = false }
        do {
            appState.account = try await appState.authService.signIn()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
