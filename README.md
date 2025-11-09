# DevAPI

A full-stack RESTful API built with Express, TypeScript, and Prisma for managing hauling operations, user authentication, and database administration.

## Features

- **JWT Authentication** - Secure user authentication with role-based access control
- **Hauling Operations** - Complete API for managing jobs, drivers, locations, and analytics
- **Database Management** - Admin tools for database inspection and query execution
- **Real-time Support** - Optimized endpoints for heartbeat and location tracking
- **Rate Limiting** - Tiered per-IP rate limiting to prevent abuse
- **Compatibility Layer** - Automatic response format detection and transformation
- **Security** - Helmet.js security headers, CORS protection, and input validation

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Authentication**: JWT (jsonwebtoken)
- **Security**: Helmet, CORS, bcrypt, express-rate-limit
- **Database**: PostgreSQL (via Prisma)

## Installation

```bash
# Clone the repository
git clone https://github.com/AndyBodnar/devapi.git
cd devapi

# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=4000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/devapi"

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend.com
```

## API Documentation

Base URL: `http://localhost:4000`

### Health Check

#### GET /health
Check API status and service availability.

**Response:**
```json
{
  "status": "ok",
  "message": "DevApi is running!",
  "services": ["auth", "database", "hauling"],
  "timestamp": "2025-11-09T12:00:00.000Z",
  "compatibilityLayer": "active",
  "rateLimiting": "tiered-per-ip"
}
```

---

## Authentication

### POST /api/auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "1",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "USER"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### POST /api/auth/login
Authenticate and receive JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "1",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "USER"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### GET /api/auth/me
Get current authenticated user information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "1",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER"
  }
}
```

### POST /api/auth/logout
Logout current user (invalidate token).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## User Management

All user management endpoints require **admin authentication**.

### GET /api/users
Get all users.

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "USER",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### GET /api/users/:id
Get user by ID.

### POST /api/users
Create a new user.

### PUT /api/users/:id
Update user information.

### DELETE /api/users/:id
Delete a user.

---

## Database Management

All database endpoints require **admin authentication**.

### GET /api/database/tables
List all database tables.

**Response:**
```json
{
  "success": true,
  "data": ["User", "Job", "Driver", "TimeLog", "Attachment"]
}
```

### GET /api/database/stats
Get database statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "tables": 5,
    "totalRecords": 1523,
    "databaseSize": "45.2 MB"
  }
}
```

### GET /api/database/tables/:tableName/schema
Get schema for a specific table.

### GET /api/database/tables/:tableName/data
Get data from a specific table.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Records per page (default: 50)

### POST /api/database/query
Execute custom SQL query.

**Request Body:**
```json
{
  "query": "SELECT * FROM \"User\" WHERE role = 'ADMIN'"
}
```

### DELETE /api/database/tables/:tableName/rows
Delete specific row(s) from a table.

---

## Hauling Operations

### Jobs

#### GET /api/hauling/jobs
Get all jobs (filtered by user role).

- **Admin**: Returns all jobs
- **User/Driver**: Returns only assigned jobs

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "pickupAddress": "123 Main St",
      "deliveryAddress": "456 Oak Ave",
      "status": "pending",
      "driverId": "2",
      "assignedTo": "2",
      "createdAt": "2025-11-09T08:00:00.000Z",
      "timeLogs": [],
      "attachments": []
    }
  ]
}
```

#### POST /api/hauling/jobs
Create a new job (admin only).

**Request Body:**
```json
{
  "pickupAddress": "123 Main St",
  "deliveryAddress": "456 Oak Ave",
  "driverId": "2",
  "assignedTo": "2",
  "notes": "Fragile items"
}
```

#### PUT /api/hauling/jobs/:id/status
Update job status.

**Request Body:**
```json
{
  "status": "in_progress"
}
```

### Drivers

#### GET /api/hauling/drivers
Get all drivers.

#### POST /api/hauling/drivers
Create a new driver.

#### PUT /api/hauling/drivers/:id
Update driver information.

#### DELETE /api/hauling/drivers/:id
Delete a driver.

### Real-time Tracking

#### POST /api/hauling/heartbeat
Send driver heartbeat signal.

**Rate Limit:** 15,000 requests per 15 minutes per IP

**Request Body:**
```json
{
  "driverId": "1",
  "timestamp": "2025-11-09T12:00:00.000Z",
  "status": "active"
}
```

#### POST /api/hauling/location
Update driver location.

**Rate Limit:** 15,000 requests per 15 minutes per IP

**Request Body:**
```json
{
  "driverId": "1",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "timestamp": "2025-11-09T12:00:00.000Z"
}
```

### Analytics

#### GET /api/hauling/analytics
Get hauling analytics and metrics.

**Query Parameters:**
- `startDate` - Start date (ISO 8601)
- `endDate` - End date (ISO 8601)
- `driverId` - Filter by driver

### Notifications

#### GET /api/hauling/notifications
Get user notifications.

#### POST /api/hauling/notifications
Create a notification.

#### PUT /api/hauling/notifications/:id/read
Mark notification as read.

### Documents

#### GET /api/hauling/documents
Get all documents.

#### POST /api/hauling/documents
Upload a new document.

#### DELETE /api/hauling/documents/:id
Delete a document.

### DVIR (Driver Vehicle Inspection Report)

#### GET /api/hauling/dvir
Get all DVIR reports.

#### POST /api/hauling/dvir
Submit a DVIR report.

### Issues

#### GET /api/hauling/issues
Get all reported issues.

#### POST /api/hauling/issues
Report a new issue.

#### PUT /api/hauling/issues/:id
Update issue status.

### Errors

#### GET /api/hauling/errors
Get application error logs.

#### POST /api/hauling/errors
Log a new error.

### Settings

#### GET /api/hauling/settings
Get user/driver settings.

#### PUT /api/hauling/settings
Update settings.

### Audit

#### GET /api/hauling/audit
Get audit logs.

---

## Metrics

### GET /api/metrics
Get API usage metrics and statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRequests": 12458,
    "activeUsers": 45,
    "uptime": "7d 14h 32m",
    "averageResponseTime": "125ms"
  }
}
```

---

## Rate Limiting

The API uses tiered per-IP rate limiting:

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Auth (`/api/auth/*`) | 100 requests | 15 minutes |
| Real-time (`/api/hauling/heartbeat`, `/api/hauling/location`) | 15,000 requests | 15 minutes |
| General API | 3,000 requests | 15 minutes |

**Rate Limit Headers:**
```
RateLimit-Limit: 3000
RateLimit-Remaining: 2999
RateLimit-Reset: 1699545600
```

**Rate Limit Error Response:**
```json
{
  "success": false,
  "error": "Too many requests, please try again later."
}
```

---

## Error Handling

All errors follow a consistent format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message here"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Authentication

Most endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Roles

- **ADMIN** - Full access to all endpoints
- **USER** - Limited access to user-specific data
- **DRIVER** - Access to hauling operations

---

## Scripts

```json
{
  "dev": "nodemon --exec ts-node src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js",
  "prisma:generate": "prisma generate",
  "prisma:migrate": "prisma migrate dev",
  "prisma:push": "prisma db push",
  "prisma:studio": "prisma studio"
}
```

---

## Security Features

- Helmet.js security headers
- CORS protection with whitelist
- JWT authentication
- Password hashing with bcrypt
- SQL injection protection via Prisma
- Rate limiting per IP
- Input validation with Zod
- Environment variable protection

---

## Project Structure

```
devapi/
├── src/
│   ├── config/          # Database configurations
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Custom middleware
│   ├── routes/          # API routes
│   │   └── hauling/     # Hauling-specific routes
│   ├── utils/           # Utility functions
│   └── server.ts        # Main server file
├── prisma/              # Prisma schema and migrations
├── migrations/          # SQL migrations
├── dist/                # Compiled TypeScript output
├── .env                 # Environment variables
├── package.json
└── tsconfig.json
```

---

## Author

**Andy Bodnar**

---

## License

ISC

---

## Support

For issues or questions, please open an issue on GitHub.
