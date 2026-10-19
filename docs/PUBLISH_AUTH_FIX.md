# GitHub Publication Authorization & Permission Architecture

## Overview
This document specifies the authentication boundaries, required token permissions, and failure-handling matrix for GitHub publishing in MarkForge Markdown Studio (Release 0.5+).

---

## 1. Required GitHub Token Permissions

GitHub supports two primary Personal Access Token (PAT) formats: **Fine-grained Personal Access Tokens** and **Classic Personal Access Tokens**.

### A. Fine-Grained Personal Access Tokens (Recommended by GitHub)
Fine-grained PATs offer principle-of-least-privilege scoping per repository.

* **Resource Owner:** Must match the account or organization owning the target repository (e.g., `kumaradoss16`).
* **Repository Access:** Must be configured as either:
  * **All repositories**, OR
  * **Only select repositories**, explicitly including the repository to be published to (e.g., `kumaradoss16/linux`).
* **Repository Permissions:**
  * **Contents: Read and write** — *Mandatory* for publishing file updates (`PUT /repos/{owner}/{repo}/contents/{path}`) and creating working branches (`POST /repos/{owner}/{repo}/git/refs`).
  * **Metadata: Read** — *Mandatory* (automatically granted by GitHub, needed to query repo details).
  * **Pull requests: Read and write** — *Required* if the user chooses the optional *"Open a Pull Request automatically after publishing"* workflow (`POST /repos/{owner}/{repo}/pulls`).

> **Note on Fine-grained PAT 403 behavior:**
> If a token has only `Contents: Read` on a repository, `GET /repos/{owner}/{repo}` may succeed and even return `permissions: { push: true }` if the token's owner is the repository owner. However, any mutating call (`PUT .../contents` or `POST .../git/refs`) will return `403 Forbidden` with body:
> `{"message":"Resource not accessible by personal access token"}`.

### B. Classic Personal Access Tokens
Classic PATs use global OAuth-style scopes.

* **`repo` (Full control of private repositories):**
  * Grants `repo:status`, `repo_deployment`, `public_repo`, `repo:invite`, and `security_events`.
  * Allows reading and writing file contents, creating git refs/branches, and opening pull requests across public and private repositories accessible to the user.
* *Alternative for public-only repositories:* **`public_repo`** scope (if target repository is public and PRs are not needed, though `repo` is recommended to avoid permission confusion).

---

## 2. Failure Matrix & Remediation Mapping

| Class | HTTP Status / Trigger | Raw GitHub Signature | ErrorCode | User-Facing Actionable Resolution |
|---|---|---|---|---|
| **PAT Missing Write Scope** | `403 Forbidden` on `PUT .../contents` or `POST .../git/refs` | `"Resource not accessible by personal access token"` | `UNAUTHORIZED_WRITE` (Hint: `PAT_CONTENTS_WRITE_REQUIRED`) | Explain that the PAT lacks write permissions. Provide 1-click **Reconnect GitHub** button and steps to add **Contents: Read and write** or classic `repo` scope. |
| **Account Lacks Push Access** | `403 Forbidden` on preflight or write | `"Must have push access to repository"` | `UNAUTHORIZED_WRITE` | Inform user that their GitHub user account does not have write/collaborator permissions to the target repository. |
| **Repo Omitted from PAT Selection** | `404 Not Found` or `403 Forbidden` on write or git refs | `"Not Found"` or `"Resource not accessible..."` | `NOT_FOUND` / `UNAUTHORIZED_WRITE` | GitHub hides repository existence if the fine-grained PAT does not include the repo in its "Only select repositories" list. Guide user to verify repository access in GitHub Developer Settings. |
| **Expired / Invalid Credentials** | `401 Unauthorized` | `"Bad credentials"` | `AUTH_REQUIRED` | Direct user to reconnect with a valid, non-expired PAT. Local drafts are strictly preserved. |
| **Concurrent Remote Modification** | `409 Conflict` on `PUT .../contents` | `"sha does not match"` | `CONFLICT_DETECTED` | Concurrency safeguard (Invariant 6). Block publication to prevent blind overwrite; offer side-by-side diff resolution. |
| **Working Branch Already Exists** | `422 Unprocessable Entity` or `409 Conflict` on `POST .../git/refs` | `"Reference already exists"` | `INVALID_INPUT` / `CONFLICT_DETECTED` | Prompt user to choose an alternative branch name or uncheck working branch. |
| **Invalid Base Commit SHA** | `422 Unprocessable Entity` on `POST .../git/refs` | `"Object does not exist"` | `INVALID_INPUT` | Prompt user to refresh remote state to synchronize with latest remote branch tip. |

---

## 3. Security & Integrity Invariants (Release 0.5)

1. **Zero Credential Leakage (Invariant 16):** Raw tokens (`ghp_`, `github_pat_`, Bearer headers) and raw GitHub error JSON dumps must never be displayed in UI messages or stored in logs.
2. **Single-Use Publication Tickets (Invariant 8):** Every mutating network call consumes its ticket immediately, preventing replay attacks.
3. **No Blind Retries (Invariant 10):** Mutating requests (Contents PUT, Refs POST, Pulls POST) are never retried automatically on failure.
4. **Draft Preservation (Invariant 10 / 18):** Disconnecting or updating GitHub authentication tokens never deletes or mutates local Markdown drafts or recovery journals.
