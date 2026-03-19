# Report Group — Frontend Integration Guide

## Overview

Users can **report a group/chatroom** (hashtag chatroom or private group). The backend supports two actions from the same API:

1. **Report only** — Submit a report; the user stays in the group.
2. **Report and leave** — Submit a report and leave the group in one step (group is removed from their list for private groups).

The frontend should render a report screen (e.g. at `/report/:chatroomId`) with a **reason** input and **two buttons**: “Report only” and “Report and leave”.

---

## API

### Report group (report only or report and leave)

**Endpoint:** `POST /reportGroup`

**Headers:**

- `Authorization: Bearer <access_token>` (required)

**Request body:**

| Field             | Type    | Required | Description                                                                 |
|-------------------|--------|----------|-----------------------------------------------------------------------------|
| `chatroomId`      | string | Yes      | MongoDB ObjectId of the chatroom (hashtag chatroom or private chatroom).   |
| `chatroomType`    | string | Yes      | `"hashtag"` or `"private"`.                                                 |
| `reason`          | string | Yes      | Report reason (e.g. free text or predefined: Spam, Harassment, Other).    |
| `leaveAfterReport`| boolean| No       | Default `false`. `true` = report and leave the group.                       |

**Example — Report only:**

```json
{
  "chatroomId": "507f1f77bcf86cd799439011",
  "chatroomType": "private",
  "reason": "Spam",
  "leaveAfterReport": false
}
```

**Example — Report and leave:**

```json
{
  "chatroomId": "507f1f77bcf86cd799439011",
  "chatroomType": "private",
  "reason": "Inappropriate content",
  "leaveAfterReport": true
}
```

**Success response (200):**

```json
{
  "message": "Report submitted successfully. We will review it.",
  "leaveAfterReport": false
}
```

When `leaveAfterReport` was `true`:

```json
{
  "message": "Report submitted. You have left the group.",
  "leaveAfterReport": true
}
```

If the user had **already reported** this group and calls again:
- With **`leaveAfterReport: true`**: the server does **not** create a new report but **still performs the leave** and returns **200** with `"message": "You have left the group."`.
- With **`leaveAfterReport: false`** (“Report only”): the server does **not** create a new report and returns **200** with the same shape: `"message": "Report submitted successfully. We will review it."`.

**Error responses:**

| HTTP | Error code | Meaning |
|------|------------|---------|
| 400  | ERR-151    | User is not a participant of this group. |
| 400  | ERR-116    | Chatroom not found. |
| 400  | ERR-400    | Invalid request (e.g. invalid `chatroomType`). |
| 401  | —          | Missing or invalid token. |

---

## Frontend implementation

### 1. Route and screen

- Add a route such as `/report/:chatroomId` (or `/report/:chatroomType/:chatroomId` if you need type in the URL).
- On that screen you need: `chatroomId`, `chatroomType` (`"hashtag"` or `"private"`), and a way for the user to enter a **reason** (dropdown and/or text field).

### 2. Two buttons

- **Button 1 — “Report only”**  
  - Call `POST /reportGroup` with `leaveAfterReport: false`.  
  - On success: show “Report sent” (or use `response.message`) and stay on the group or go back (e.g. pop or navigate back).

- **Button 2 — “Report and leave”**  
  - Call `POST /reportGroup` with `leaveAfterReport: true`.  
  - On success: show “Report sent and you have left the group” (or use `response.message`), then **navigate away** from the group (e.g. to chat list or home) and **remove the group from the client’s list** so the UI matches the server.

### 3. Example API call (fetch)

```javascript
async function reportGroup(chatroomId, chatroomType, reason, leaveAfterReport) {
  const res = await fetch(`${API_BASE}/reportGroup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      chatroomId,
      chatroomType,
      reason: reason.trim(),
      leaveAfterReport: !!leaveAfterReport,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    // data.code may be ERR-150, ERR-151, etc.
    throw new Error(data.message || 'Report failed');
  }

  return data; // { message, leaveAfterReport }
}
```

### 4. Example usage in the report screen

```javascript
// In your ReportGroupScreen / ReportGroupModal
const chatroomId = params.chatroomId;   // from route
const chatroomType = params.chatroomType; // 'hashtag' | 'private'

const [reason, setReason] = useState('');
const [loading, setLoading] = useState(false);

const handleReportOnly = async () => {
  if (!reason.trim()) return;
  setLoading(true);
  try {
    const result = await reportGroup(chatroomId, chatroomType, reason, false);
    showToast(result.message);
    navigation.goBack();
  } catch (e) {
    showToast(e.message);
  } finally {
    setLoading(false);
  }
};

const handleReportAndLeave = async () => {
  if (!reason.trim()) return;
  setLoading(true);
  try {
    const result = await reportGroup(chatroomId, chatroomType, reason, true);
    showToast(result.message);
    // Leave group screen and remove from list
    navigation.navigate('ChatList');
    removeChatroomFromList(chatroomId);
  } catch (e) {
    showToast(e.message);
  } finally {
    setLoading(false);
  }
};
```

### 5. Error handling

- **Already reported:** The server never returns an error for “already reported”. It returns **200** with the same response shape and does **not** create a new report. For “Report only” the message is “Report submitted successfully. We will review it.”; for “Report and leave” the server still performs the leave and returns “You have left the group.”
- **ERR-151 (Not a participant):** Show “You are not a participant of this group.” Hide or disable the report UI if they shouldn’t be on this screen.

### 6. Optional: check if user already reported

The backend does not expose a dedicated “has user reported this group?” endpoint. If the user already reported and taps **Report only** or **Report and leave** again, the server returns **200** (no new report entry). For “Report and leave” it still performs the leave. You can remember in local state that the user already reported and disable or relabel the buttons if desired.

---

## Summary

| Action            | `leaveAfterReport` | After success                         |
|-------------------|--------------------|----------------------------------------|
| Report only       | `false`            | Show success; stay or go back.        |
| Report and leave  | `true`             | Show success; navigate away; remove group from list. |

Use the same `POST /reportGroup` endpoint for both buttons; only the `leaveAfterReport` value and post-success navigation differ.
