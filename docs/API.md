# API Documentation

## Base URL
```
https://your-api-gateway-url.execute-api.eu-north-1.amazonaws.com/prod
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### Health Check
```http
GET /health
```
**Description:** Check if the API is running
**Authentication:** None required
**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### User Search
```http
GET /api/v1/users/search?username={username}
```
**Description:** Search for Trackmania users
**Authentication:** None required
**Parameters:**
- `username` (string, required): Username to search for

**Response:**
```json
{
  "users": [
    {
      "accountId": "12345",
      "displayName": "PlayerName",
      "zone": "World"
    }
  ]
}
```

### User Maps
```http
GET /api/v1/users/maps?username={username}&timeframe={timeframe}
```
**Description:** Get maps for a specific user
**Authentication:** None required
**Parameters:**
- `username` (string, required): Username to get maps for
- `timeframe` (string, optional): "1d", "1w", "1m" (default: "1d")

**Response:**
```json
{
  "jobId": "uuid-string",
  "status": "processing",
  "message": "Job queued for background processing"
}
```

### Job Status
```http
GET /api/v1/users/maps/status/{jobId}
```
**Description:** Check the status of a map search job
**Authentication:** None required
**Response:**
```json
{
  "status": "completed",
  "results": {
    "maps": [
      {
        "mapId": "map123",
        "mapName": "Test Map",
        "records": [
          {
            "position": 1,
            "time": "00:45.123",
            "player": "PlayerName"
          }
        ]
      }
    ]
  }
}
```

### Authentication

#### Login
```http
POST /api/v1/auth/login
```
**Description:** Authenticate user and get JWT tokens
**Authentication:** None required
**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```
**Response:**
```json
{
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token",
  "user": {
    "id": 1,
    "username": "username",
    "email": "user@example.com",
    "role": "user"
  }
}
```

#### Register
```http
POST /api/v1/auth/register
```
**Description:** Create a new user account
**Authentication:** None required
**Body:**
```json
{
  "username": "username",
  "email": "user@example.com",
  "password": "password123"
}
```

### Alerts

#### Get User Alerts
```http
GET /api/v1/alerts
```
**Description:** Get all alerts for the authenticated user
**Authentication:** Required
**Response:**
```json
{
  "alerts": [
    {
      "id": 1,
      "username": "mapper123",
      "alertType": "accurate",
      "mapCount": 5,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Create Alert
```http
POST /api/v1/alerts
```
**Description:** Create a new mapper alert
**Authentication:** Required
**Body:**
```json
{
  "username": "mapper123",
  "alertType": "accurate"
}
```

#### Delete Alert
```http
DELETE /api/v1/alerts/{alertId}
```
**Description:** Delete a mapper alert
**Authentication:** Required

### Driver Notifications

#### Get Driver Notifications
```http
GET /api/v1/driver-notifications
```
**Description:** Get all driver notifications for the authenticated user
**Authentication:** Required

#### Create Driver Notification
```http
POST /api/v1/driver-notifications
```
**Description:** Create a new driver notification
**Authentication:** Required
**Body:**
```json
{
  "mapId": "map123",
  "mapName": "Test Map"
}
```

### Admin Endpoints

#### Get Admin Configuration
```http
GET /api/v1/admin/config
```
**Description:** Get admin configuration settings
**Authentication:** Required (Admin only)

#### Update Admin Configuration
```http
PUT /api/v1/admin/config
```
**Description:** Update admin configuration settings
**Authentication:** Required (Admin only)

#### Get All Users
```http
GET /api/v1/admin/users
```
**Description:** Get all users in the system
**Authentication:** Required (Admin only)

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Common Error Codes:**
- `UNAUTHORIZED`: Invalid or missing JWT token
- `FORBIDDEN`: Insufficient permissions
- `VALIDATION_ERROR`: Invalid request data
- `NOT_FOUND`: Resource not found
- `INTERNAL_ERROR`: Server error

## Rate Limits

- API Gateway: 10,000 requests per day (free tier)
- Trackmania API: 2 requests per second (enforced by our system)
