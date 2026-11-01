---
name: make-skill
description: Create a new Claude Code skill (a folder with a SKILL.md) in this repo or in the user's personal skills. Use when the user asks to make, create, scaffold, or write a skill, slash command, or reusable workflow for Claude, or asks how skills work.
---

# Make a skill

A skill is a folder containing a `SKILL.md` file. Claude reads the file's
`description` to decide when to load the skill, and the user can run it
directly with `/<skill-name>`.

## 1. Gather what the skill should do

Ask only for what you can't infer from the conversation:

- **Job**: what task the skill performs, and what it produces.
- **Triggers**: the phrases or situations that should make Claude use it.
- **Steps**: the procedure, commands, conventions or templates to follow.
- **Scope**: this repo only, or everywhere for this user.

If the user points at earlier work ("make this a skill"), turn that
workflow into the skill's steps instead of asking again.

## 2. Pick the location

| Location | Who gets it |
|---|---|
| `.claude/skills/<skill-name>/SKILL.md` in the repo | Anyone working in the repo. Commit it. |
| `~/.claude/skills/<skill-name>/SKILL.md` | Only this user, in every project, on that machine. |

In a cloud or other ephemeral session, always use the repo location and
commit it, because `~/.claude` is lost when the container goes away.

## 3. Write `SKILL.md`

```markdown
---
name: <skill-name>
description: <What it does>. Use when <the situations and phrases that should trigger it>.
---

# <Title>

1. <First step, concrete: commands, file paths, expected output>
2. <Next step>
3. <How to finish and what to report back>
```

Rules:

- `name`: lowercase words joined by hyphens, matching the folder name. It
  becomes the slash command.
- `description`: the most important line. State what the skill does *and*
  when to use it, with the words a user would actually say. Claude decides
  whether to load the skill from this line alone.
- Body: plain, direct instructions, as you'd brief a capable coworker.
  Explain the reason behind any non-obvious rule. Keep it focused.
- Don't invent facts about the project. Check commands and paths exist
  before writing them into the skill.

## 4. Add supporting files (only if needed)

```
.claude/skills/<skill-name>/
├── SKILL.md
├── reference.md   # long docs; SKILL.md says when to read it
├── template.md    # output templates
└── scripts/       # scripts Claude runs instead of retyping logic
```

Mention each file in `SKILL.md` and say when to use it; Claude only reads
what the skill points to.

## 5. Finish

1. Re-read the `SKILL.md` and check that the frontmatter is valid YAML and
   the `name` matches the folder.
2. If it's in a repo, commit it (and push if the user's workflow calls for it).
3. Tell the user the path, the slash command (`/<skill-name>`), and that a
   new skill loads at the start of a session, so they may need to start a
   new one for it to appear.
