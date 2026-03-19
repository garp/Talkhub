# Socket: Get Files (Links / Docs / Media)

This socket event lets clients fetch a “media browser” list for:

- **Hashtag chats** (by `hashtagId`)
- **Private chatrooms** (by `chatroomId`)

---

## Event names

- **Client emits**: `getFiles`
- **Server success**: `getFilesSuccess`
- **Server failed**: `getFilesFailed`

---

## Client payload

```json
{
  "hashtagId": "OPTIONAL_OBJECT_ID",
  "chatroomId": "OPTIONAL_OBJECT_ID",
  "type": ["links", "doc", "media"],
  "page": 1,
  "limit": 50
}
```

Rules:

- Provide **either** `hashtagId` **or** `chatroomId`
  - If `hashtagId` is provided, server resolves the hashtag’s `chatroomId` internally.
  - If `chatroomId` is provided, server treats it as a **private chatroom** id.
- `type` can be a string or array. Allowed values:
  - `links`
  - `doc`
  - `media`
- Pagination is per type query (server uses the same `page/limit` for each requested type).

---

## Auth / permissions

- Uses `socket.handshake.query.userId` (token verified by existing socket auth middleware).
- **Hashtag**: user must be a participant of that hashtag chatroom.
- **Private chatroom**: user must be a participant and must not have `deletedForMe=true` for that chatroom.

---

## Success response (`getFilesSuccess`)

```json
{
  "scope": "hashtag",
  "hashtagId": "64f1c2e9d9c1c2e9d9c1c2e9",
  "chatroomId": "64f1c2e9d9c1c2e9d9c1c2e0",
  "types": ["links", "doc", "media"],
  "metadata": { "page": 1, "limit": 50 },
  "results": {
    "links": [
      {
        "url": "https://example.com",
        "messageId": "64f1c2e9d9c1c2e9d9c1c2aa",
        "senderId": "64f1c2e9d9c1c2e9d9c1c200",
        "createdAt": "2025-12-28T10:00:00.000Z"
      }
    ],
    "doc": [
      {
        "messageId": "64f1c2e9d9c1c2e9d9c1c2bb",
        "senderId": "64f1c2e9d9c1c2e9d9c1c200",
        "messageType": "file",
        "url": "https://cdn.example.com/file.pdf",
        "mediaAssetId": null,
        "createdAt": "2025-12-28T10:05:00.000Z"
      }
    ],
    "media": [
      {
        "messageId": "64f1c2e9d9c1c2e9d9c1c2cc",
        "senderId": "64f1c2e9d9c1c2e9d9c1c200",
        "messageType": "image",
        "url": "https://cdn.example.com/img.jpg",
        "mediaAssetId": null,
        "createdAt": "2025-12-28T10:10:00.000Z"
      }
    ]
  }
}
```

---

## Failure response (`getFilesFailed`)

```json
{
  "message": "Invalid data. hashtagId or chatroomId is required."
}
```


