# Sales Route CRM

A GPS-enabled Customer Relationship Management (CRM) platform designed for sales teams and small business owners. Build optimized sales routes, manage customer relationships, and track quarterly engagements—all without expensive software.

## Features

### 📍 GPS & Route Management
- **Interactive Map View**: Visualize all customers on a map
- **Route Optimization**: Automatically build efficient sales routes based on address, city, or postal code
- **Road Trip Planning**: Create 1-day to multi-week sales trips with unlimited customer visits
- **Break Management**: Insert lunch breaks, meetings, and "off-duty" time
- **Turn-by-Turn Directions**: Get navigation guidance between customer locations

### 💼 Customer Database
- **Customer Tiers**: Organize customers into three buckets:
  - **Tier 1**: Current customers (buy regularly, need quarterly visits/calls)
  - **Tier 2**: Cold/Warm/Hot leads (prospects and drops-ins)
  - **Tier 3**: Inactive customers (haven't purchased in 365+ days)
  - **Tier 4**: Cold leads (met through cold calling, low priority)

### 📊 Customer Management
- Company profiles with unique IDs
- Individual client profiles linked to companies
- Contact information (name, address, city, postal code, province, country)
- Customer categorization (hot, warm, cold)
- Last contact tracking for automatic 365-day reminders

### 🛣️ Flexible Road Trip Builder
- Customize trip duration (1 day to indefinite)
- Set working hours and off-duty times
- Auto-repeat parameters for multi-day trips
- Add/remove customers on the fly
- Real-time route recalculation

## Tech Stack

- **Frontend**: React.js, Google Maps API, Material-UI
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with PostGIS (geospatial queries)
- **Route Optimization**: Google Maps Directions API / OSRM
- **Authentication**: JWT (JSON Web Tokens)
- **Deployment**: Docker-ready, AWS/Heroku compatible

## Project Structure

```
sales-route-crm/
├── frontend/              # React application
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── App.js
│   └── package.json
├── backend/               # Node.js/Express API
│   ├── routes/
│   ├── controllers/
│   ├── models/
│   ├── middleware/
│   ├── server.js
│   └── package.json
├── database/              # Database schema & migrations
│   ├── schema.sql
│   ├── migrations/
│   └── seed-data.sql
├── docs/                  # Documentation
│   ├── API.md
│   ├── DATABASE.md
│   └── SETUP.md
└── docker-compose.yml     # Docker configuration
```

## Getting Started

See [SETUP.md](docs/SETUP.md) for detailed installation and development instructions.

## Database Schema Overview

### Core Tables
- **companies**: Company information
- **clients**: Individual contacts linked to companies
- **customers**: Customer tier/status information
- **road_trips**: Sales trip planning
- **trip_stops**: Individual stops within a road trip
- **interactions**: Track calls, visits, and engagement
- **break_times**: Scheduled breaks and off-duty periods

## Pricing Model

- **Monthly Subscription**: $29.99/month
- **Annual Subscription**: $299.00/year (2-month savings)

## Roadmap

- [ ] v1.0: Core CRM + Basic route planning
- [ ] v1.1: Advanced route optimization (ML-based)
- [ ] v1.2: Mobile app (React Native)
- [ ] v1.3: Integration with calendars & email
- [ ] v1.4: Analytics dashboard & sales reporting
- [ ] v2.0: Team management & performance tracking

## License

MIT License - See LICENSE file for details

## Support

For issues, feature requests, or questions, please create an issue in the repository.

---

**Built for sales teams who don't need expensive CRM tools—just results.**
