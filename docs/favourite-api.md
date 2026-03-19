# Favourite API Documentation

API endpoints for managing user favourites (places, hotels, restaurants, etc.)

**Base URL:** `/favourite`  
**Authentication:** Bearer Token (required for all endpoints)

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/favourite` | Add a place to favourites |
| GET | `/favourite` | Get user's favourites list |
| GET | `/favourite/check/:placeId` | Check if a place is favourited |
| DELETE | `/favourite/:placeId` | Remove a place from favourites |

---

## 1. Create Favourite

Add a place/location to the user's favourites.

### Request

```
POST /favourite
Authorization: Bearer <token>
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `placeId` | string | Yes | Unique identifier (Google Place ID or internal ID) |
| `type` | string | Yes | Type of place (see valid types below) |
| `displayName` | string | Yes | Display name of the place |
| `address` | string | No | Full address |
| `location` | object | No | Coordinates object |
| `location.latitude` | number | No | Latitude (-90 to 90) |
| `location.longitude` | number | No | Longitude (-180 to 180) |
| `rating` | number | No | Rating (0 to 5) |
| `userRatingCount` | number | No | Number of ratings |
| `photos` | string[] | No | Array of photo URLs |
| `distance` | number | No | Distance in meters |

### Valid Types

```
people | hashtag | cafe | restaurant | hotel | museum | hospital
```

### Example Request

```json
{
  "placeId": "ChIJVUizzGHvDDkRDzFsXyEC9B0",
  "type": "hotel",
  "displayName": "Nimantrana",
  "address": "Metro Station Road, Gardenia Gateway, Sector 75, Noida, Uttar Pradesh 201301, India",
  "location": {
    "latitude": 28.5723207,
    "longitude": 77.37958209999999
  },
  "rating": 4.6,
  "userRatingCount": 312,
  "photos": [
    "https://places.googleapis.com/v1/places/ChIJVUizzGHvDDkRDzFsXyEC9B0/photos/...",
    "https://places.googleapis.com/v1/places/ChIJVUizzGHvDDkRDzFsXyEC9B0/photos/..."
  ],
  "distance": 367.7978107330159
}
```

### Success Response

**Status: 201 Created**

```json
{
  "message": "Favourite added successfully",
  "favourite": {
    "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "placeId": "ChIJVUizzGHvDDkRDzFsXyEC9B0",
    "type": "hotel",
    "displayName": "Nimantrana",
    "address": "Metro Station Road, Gardenia Gateway, Sector 75, Noida, Uttar Pradesh 201301, India",
    "location": {
      "latitude": 28.5723207,
      "longitude": 77.37958209999999
    },
    "rating": 4.6,
    "userRatingCount": 312,
    "photos": ["https://..."],
    "distance": 367.7978107330159,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Error Responses

**Status: 409 Conflict** - Place already in favourites

```json
{
  "code": "ERR-FAVOURITE-EXISTS",
  "message": "This place is already in your favourites"
}
```

**Status: 400 Bad Request** - Validation error

```json
{
  "code": "ERR-400",
  "message": "Validation failed",
  "errors": [
    { "field": "placeId", "message": "placeId is required" }
  ]
}
```

---

## 2. Get Favourites

Retrieve the authenticated user's favourites with optional filtering and pagination.

### Request

```
GET /favourite
Authorization: Bearer <token>
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | `all` | Filter by type (`all`, `people`, `hashtag`, `cafe`, `restaurant`, `hotel`, `museum`, `hospital`) |
| `page` | number | `1` | Page number (starts from 1) |
| `limit` | number | `20` | Items per page (max: 100) |

### Example Requests

```
GET /favourite
GET /favourite?type=hotel
GET /favourite?type=restaurant&page=2&limit=10
```

### Success Response

**Status: 200 OK**

```json
{
  "favourites": [
    {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
      "placeId": "ChIJVUizzGHvDDkRDzFsXyEC9B0",
      "type": "hotel",
      "displayName": "Nimantrana",
      "address": "Metro Station Road, Gardenia Gateway...",
      "location": {
        "latitude": 28.5723207,
        "longitude": 77.37958209999999
      },
      "rating": 4.6,
      "userRatingCount": 312,
      "photos": ["https://..."],
      "distance": 367.79,
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d1",
      "placeId": "ChIJ123456789",
      "type": "cafe",
      "displayName": "Starbucks",
      "address": "Some Address...",
      "location": {
        "latitude": 28.1234,
        "longitude": 77.5678
      },
      "rating": 4.2,
      "userRatingCount": 150,
      "photos": ["https://..."],
      "distance": 500.5,
      "createdAt": "2024-01-14T08:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalCount": 100,
    "limit": 20,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Empty Response

```json
{
  "favourites": [],
  "pagination": {
    "currentPage": 1,
    "totalPages": 0,
    "totalCount": 0,
    "limit": 20,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

---

## 3. Check Favourite

Check if a specific place is in the user's favourites.

### Request

```
GET /favourite/check/:placeId
Authorization: Bearer <token>
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `placeId` | string | Yes | The place ID to check |

### Example Request

```
GET /favourite/check/ChIJVUizzGHvDDkRDzFsXyEC9B0
```

### Success Response

**Status: 200 OK**

```json
{
  "isFavourite": true,
  "placeId": "ChIJVUizzGHvDDkRDzFsXyEC9B0"
}
```

Or if not favourited:

```json
{
  "isFavourite": false,
  "placeId": "ChIJVUizzGHvDDkRDzFsXyEC9B0"
}
```

---

## 4. Delete Favourite

Remove a place from the user's favourites.

### Request

```
DELETE /favourite/:placeId
Authorization: Bearer <token>
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `placeId` | string | Yes | The place ID to remove |

### Example Request

```
DELETE /favourite/ChIJVUizzGHvDDkRDzFsXyEC9B0
```

### Success Response

**Status: 200 OK**

```json
{
  "message": "Favourite removed successfully",
  "placeId": "ChIJVUizzGHvDDkRDzFsXyEC9B0"
}
```

### Error Response

**Status: 404 Not Found**

```json
{
  "code": "ERR-FAVOURITE-NOT-FOUND",
  "message": "Favourite not found"
}
```

---

## Data Models

### Favourite Object

```typescript
interface Favourite {
  _id: string;              // MongoDB ObjectId
  placeId: string;          // Unique place identifier
  type: FavouriteType;      // Type of favourite
  displayName: string;      // Display name
  address: string;          // Full address
  location: {
    latitude: number | null;
    longitude: number | null;
  };
  rating: number | null;    // Rating (0-5)
  userRatingCount: number;  // Number of ratings
  photos: string[];         // Array of photo URLs
  distance: number | null;  // Distance in meters
  createdAt: string;        // ISO 8601 timestamp
  updatedAt: string;        // ISO 8601 timestamp
}

type FavouriteType = 
  | 'people' 
  | 'hashtag' 
  | 'cafe' 
  | 'restaurant' 
  | 'hotel' 
  | 'museum' 
  | 'hospital';
```

### Pagination Object

```typescript
interface Pagination {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `ERR-FAVOURITE-EXISTS` | 409 | Place already in favourites |
| `ERR-FAVOURITE-NOT-FOUND` | 404 | Favourite not found |
| `ERR-400` | 400 | Bad request / Validation error |
| `ERR-401` | 401 | Unauthorized (invalid/missing token) |

---

## Usage Examples

### JavaScript/Fetch

```javascript
// Add to favourites
const addFavourite = async (placeData) => {
  const response = await fetch('/favourite', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(placeData)
  });
  return response.json();
};

// Get favourites with filter
const getFavourites = async (type = 'all', page = 1) => {
  const response = await fetch(
    `/favourite?type=${type}&page=${page}&limit=20`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  return response.json();
};

// Check if favourited
const checkFavourite = async (placeId) => {
  const response = await fetch(`/favourite/check/${placeId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};

// Remove from favourites
const removeFavourite = async (placeId) => {
  const response = await fetch(`/favourite/${placeId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};
```

### React Hook Example

```javascript
const useFavourite = (placeId) => {
  const [isFavourite, setIsFavourite] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkFavourite(placeId).then(res => setIsFavourite(res.isFavourite));
  }, [placeId]);

  const toggleFavourite = async (placeData) => {
    setLoading(true);
    if (isFavourite) {
      await removeFavourite(placeId);
      setIsFavourite(false);
    } else {
      await addFavourite(placeData);
      setIsFavourite(true);
    }
    setLoading(false);
  };

  return { isFavourite, toggleFavourite, loading };
};
```

---

## Notes

- All endpoints require authentication via Bearer token
- The `placeId` field is unique per user (a user cannot favourite the same place twice)
- Favourites are sorted by `createdAt` in descending order (newest first)
- Photo URLs from Google Places API may expire; consider caching or refreshing
- The `distance` field is optional and represents the distance from the user's location when the favourite was added
