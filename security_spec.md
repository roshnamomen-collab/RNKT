# Security Specification - Parallel Text Viewer

## 1. Data Invariants
- **Sentence Integrity**: Every document in `/sentences` must contain `ottoman`, `sorani`, and `turkish` fields, all being non-empty lists of strings.
- **Mapping Integrity**: The `wordMap` field must be a list of objects containing integers or nulls.
- **Identity Integrity**: The `authorId` field must match the creator's UID.
- **Temporal Integrity**: `createdAt` must be the server time.

## 2. The Dirty Dozen Payloads
1. **Identity Spoofing**: Create a sentence with `authorId` set to another user's UID.
2. **Shadow Field Injection**: Create a sentence with an extra `isVerified: true` field.
3. **Type Poisoning**: Set `ottoman` to a string instead of a list.
4. **Empty Body**: Create a sentence with empty word lists.
5. **Unauthorized Update**: A user attempts to edit a sentence they didn't author.
6. **Immutable Hijack**: Attempting to change `authorId` or `createdAt` during an update.
7. **Junk ID**: Attempting to create a document with a 2KB string as ID.
8. **PII Leak**: Attempting to read a hypothetical `users` collection without being that user.
9. **Blanket Read Attack**: Attempting to list all sentences without being signed in (if forbidden).
10. **State Shortcut**: (N/A for this app as it's static entries).
11. **Denial of Wallet**: Sending a massive 1MB string via `turkish` field.
12. **Orphaned Write**: Writing a wordMap that references non-existent indices (hard to enforce in rules but type/size check helps).

## 3. Test Runner
(Placeholder for `firestore.rules.test.ts`)
