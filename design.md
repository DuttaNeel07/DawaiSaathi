# Design Document: DawaiSathi AI-Powered Medication Management Platform

## Overview

DawaiSathi is a serverless, event-driven medication management platform built on AWS infrastructure. The system uses WhatsApp as the primary interface (via Twilio/360Dialog) and provides a web dashboard for comprehensive medication tracking. The architecture leverages 15+ AWS services to deliver AI-powered prescription processing, intelligent reminders, drug interaction checking, and adherence monitoring for 130 crore Indians.

### Design Principles

1. **Serverless-First**: Use Lambda for compute to minimize costs and maximize scalability
2. **Event-Driven**: EventBridge orchestrates time-based reminders and scheduled jobs
3. **Multi-Channel**: WhatsApp primary, web dashboard secondary, SMS/email fallback
4. **AI-Powered**: Claude API for explanations, AWS ML services for document processing
5. **Multilingual**: Support 8 Indian languages with voice accessibility
6. **Security-First**: Encryption at rest/transit, HIPAA-compliant, data residency in India
7. **Cost-Optimized**: Target <₹5/user/month at 100K scale using caching and optimization
8. **Resilient**: Multi-AZ deployment, automatic retries, graceful degradation

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Interfaces                              │
├──────────────────────┬──────────────────────┬──────────────────────┤
│   WhatsApp (Primary) │  Web Dashboard       │  SMS/Email (Fallback)│
│   Twilio/360Dialog   │  CloudFront + S3     │  SNS + SES           │
└──────────┬───────────┴──────────┬───────────┴──────────┬───────────┘
           │                      │                      │
           └──────────────────────┼──────────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │      API Gateway          │
                    │   (REST + WebSocket)      │
                    └─────────────┬─────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
┌───────▼────────┐    ┌──────────▼──────────┐   ┌─────────▼────────┐
│  Lambda Layer  │    │   EventBridge       │   │  Step Functions  │
│  (Business     │    │   (Schedulers)      │   │  (Workflows)     │
│   Logic)       │    │                     │   │                  │
└───────┬────────┘    └──────────┬──────────┘   └─────────┬────────┘
        │                        │                         │
        └────────────────────────┼─────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
┌───────▼────────┐   ┌──────────▼──────────┐  ┌─────────▼────────┐
│  Data Layer    │   │   AI/ML Services    │  │  External APIs   │
├────────────────┤   ├─────────────────────┤  ├──────────────────┤
│ RDS PostgreSQL │   │ Textract (OCR)      │  │ Claude API       │
│ DynamoDB       │   │ Comprehend Medical  │  │ DrugBank API     │
│ ElastiCache    │   │ Rekognition         │  │ RxNorm API       │
│ S3 (Documents) │   │ Translate (optional)│  │ Pharmacy APIs    │
└────────────────┘   └─────────────────────┘  └──────────────────┘
        │
┌───────▼────────────────────────────────────────────────────┐
│              Security & Monitoring Layer                   │
├────────────────┬──────────────┬──────────────┬────────────┤
│ Cognito (Auth) │ KMS (Encrypt)│ WAF (Protect)│ CloudWatch │
│ Secrets Mgr    │ IAM (Access) │ X-Ray (Trace)│ Alarms     │
└────────────────┴──────────────┴──────────────┴────────────┘
```

## Architecture

### Component Breakdown

#### 1. Interface Layer

**WhatsApp Interface (Primary)**
- **Technology**: Twilio/360Dialog WhatsApp Business API
- **Purpose**: Primary user interaction channel for 550M+ WhatsApp users in India
- **Capabilities**: Text messages, image upload, voice messages, quick reply buttons
- **Integration**: Webhook to API Gateway → Lambda for message processing
- **Advantages**: Familiar interface, low data usage, works on 2G networks

**Web Dashboard (Secondary)**
- **Technology**: Next.js static site hosted on S3, served via CloudFront CDN
- **Purpose**: Comprehensive medication management for caregivers and detailed analytics
- **Features**: Multi-patient view, adherence charts, document repository, settings
- **Authentication**: AWS Cognito with email/password and social login
- **API Communication**: REST API via API Gateway with JWT tokens

**SMS/Email Fallback**
- **Technology**: AWS SNS (SMS), AWS SES (Email)
- **Purpose**: Backup notification channel when WhatsApp unavailable
- **Trigger**: Automatic fallback after WhatsApp delivery failure

#### 2. API Layer

**API Gateway Configuration**
- **Type**: REST API for web dashboard, WebSocket API for real-time updates
- **Endpoints**:
  - `/prescription` - Upload and process prescriptions
  - `/medicines` - CRUD operations for medicines
  - `/reminders` - Manage reminder schedules
  - `/adherence` - Get adherence scores and reports
  - `/family` - Multi-patient management
  - `/pharmacy` - Find nearby pharmacies
  - `/teleconsult` - Book doctor consultations
- **Security**: AWS WAF rules, API keys, JWT authentication, rate limiting (1000 req/min per user)
- **Throttling**: Burst limit 5000, steady-state 2000 requests/second

**Lambda Functions (Business Logic)**

Core Lambda functions organized by domain:

1. **PrescriptionProcessor** (FR-1)
   - Trigger: S3 image upload event
   - Actions: Invoke Textract OCR, Comprehend Medical entity extraction, validate medicines
   - Memory: 1024 MB, Timeout: 30s
   - Environment: CLAUDE_API_KEY, DRUGBANK_API_KEY

2. **MedicineExplainer** (FR-2)
   - Trigger: API Gateway POST /explain
   - Actions: Call Claude API for multilingual explanations, cache results
   - Memory: 512 MB, Timeout: 15s
   - Languages: 8 Indian languages via Claude API

3. **GenericOptimizer** (FR-3)
   - Trigger: API Gateway GET /generics
   - Actions: Query RxNorm API, calculate savings, cache mappings
   - Memory: 512 MB, Timeout: 10s
   - Cache: ElastiCache Redis (24-hour TTL)

4. **ReminderScheduler** (FR-4)
   - Trigger: API Gateway POST /reminders
   - Actions: Create EventBridge rules, store in RDS, send confirmation
   - Memory: 256 MB, Timeout: 5s

5. **ReminderSender** (FR-4)
   - Trigger: EventBridge scheduled event
   - Actions: Fetch user preferences, send WhatsApp message via Twilio, log delivery
   - Memory: 256 MB, Timeout: 10s
   - Concurrency: 1000 (handle 10K reminders/hour)

6. **DoseTracker** (FR-5)
   - Trigger: WhatsApp webhook (Yes/No response)
   - Actions: Update dose status in RDS, calculate adherence, trigger alerts
   - Memory: 256 MB, Timeout: 5s

7. **MissedDoseDetector** (FR-6)
   - Trigger: EventBridge (every 15 minutes)
   - Actions: Query unconfirmed doses, trigger Step Function for escalation
   - Memory: 256 MB, Timeout: 10s

8. **InteractionChecker** (FR-10)
   - Trigger: API Gateway POST /check-interactions
   - Actions: Query DrugBank API, check severity, cache results
   - Memory: 512 MB, Timeout: 10s
   - Cache: ElastiCache Redis (7-day TTL)

9. **AuthenticityVerifier** (FR-15)
   - Trigger: S3 barcode image upload
   - Actions: Rekognition barcode detection, CDSCO database lookup
   - Memory: 512 MB, Timeout: 10s

10. **RecallMonitor** (FR-16)
    - Trigger: EventBridge (daily at 6 AM IST)
    - Actions: Scrape FDA/CDSCO APIs, match patient medicines, send critical alerts
    - Memory: 512 MB, Timeout: 60s

#### 3. Data Layer

**RDS PostgreSQL (Primary Database)**

Schema design:

```sql
-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(255),
    preferred_language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Patients table (supports multi-patient per user)
CREATE TABLE patients (
    patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    name VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(10),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Medicines table
CREATE TABLE medicines (
    medicine_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id),
    name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    dosage VARCHAR(100),
    frequency VARCHAR(50), -- OD, BD, TDS, QID
    timing VARCHAR(50), -- AC, PC, HS
    duration_days INTEGER,
    stock_level INTEGER,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    prescription_image_s3_key VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reminders table
CREATE TABLE reminders (
    reminder_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(medicine_id),
    scheduled_time TIME NOT NULL,
    eventbridge_rule_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Doses table (adherence tracking)
CREATE TABLE doses (
    dose_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(medicine_id),
    scheduled_time TIMESTAMP NOT NULL,
    confirmed_time TIMESTAMP,
    status VARCHAR(20), -- pending, confirmed, missed, skipped
    confirmation_method VARCHAR(20), -- whatsapp, web, sms
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Caregivers table
CREATE TABLE caregivers (
    caregiver_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id),
    user_id UUID REFERENCES users(user_id),
    relationship VARCHAR(50),
    alert_preferences JSONB, -- {critical: true, daily: false, weekly: true}
    status VARCHAR(20) DEFAULT 'pending', -- pending, active, inactive
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Drug interactions cache
CREATE TABLE drug_interactions (
    interaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug1_name VARCHAR(255) NOT NULL,
    drug2_name VARCHAR(255) NOT NULL,
    severity VARCHAR(20), -- severe, moderate, mild
    description TEXT,
    source VARCHAR(50), -- drugbank, rxnorm
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(drug1_name, drug2_name)
);

-- Documents table
CREATE TABLE documents (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id),
    document_type VARCHAR(50), -- prescription, lab_report, bill, consultation
    s3_key VARCHAR(500) NOT NULL,
    extracted_text TEXT,
    metadata JSONB,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Adherence scores (materialized view updated daily)
CREATE TABLE adherence_scores (
    score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id),
    date DATE NOT NULL,
    total_doses INTEGER,
    confirmed_doses INTEGER,
    missed_doses INTEGER,
    score_percentage DECIMAL(5,2),
    UNIQUE(patient_id, date)
);

-- Indexes for performance
CREATE INDEX idx_medicines_patient ON medicines(patient_id) WHERE is_active = true;
CREATE INDEX idx_doses_medicine_time ON doses(medicine_id, scheduled_time);
CREATE INDEX idx_doses_status ON doses(status) WHERE status = 'pending';
CREATE INDEX idx_adherence_patient_date ON adherence_scores(patient_id, date DESC);
```

**Configuration**:
- Instance: db.t3.medium (2 vCPU, 4 GB RAM) for development, db.r5.large for production
- Storage: 100 GB GP3 SSD with autoscaling to 1 TB
- Multi-AZ: Enabled for high availability (automatic failover <60s)
- Backup: Automated daily backups, 7-day retention
- Read Replicas: 2 replicas for read-heavy operations (adherence reports, analytics)
- Connection Pooling: RDS Proxy with max 1000 connections

**DynamoDB (Session and Temporary Data)**

Tables:

1. **whatsapp_sessions**
   - Partition Key: `phone_number` (String)
   - Sort Key: `timestamp` (Number)
   - Attributes: `session_id`, `context`, `last_message`, `state`
   - TTL: 24 hours (auto-delete old sessions)
   - Purpose: Track conversation context for multi-turn WhatsApp interactions

2. **notification_queue**
   - Partition Key: `user_id` (String)
   - Sort Key: `scheduled_time` (Number)
   - Attributes: `notification_type`, `message`, `status`, `retry_count`
   - Purpose: Queue notifications for retry on delivery failure

**ElastiCache Redis (Caching Layer)**

Cache strategy:

1. **Generic Medicine Mappings** (FR-3)
   - Key: `generic:{brand_name}`
   - Value: JSON with generic alternatives and prices
   - TTL: 24 hours
   - Hit rate target: 85%

2. **Drug Interactions** (FR-10)
   - Key: `interaction:{drug1}:{drug2}`
   - Value: JSON with severity and description
   - TTL: 7 days
   - Hit rate target: 90%

3. **Medicine Explanations** (FR-2)
   - Key: `explain:{medicine_name}:{language}`
   - Value: Explanation text
   - TTL: 30 days
   - Hit rate target: 80%

4. **User Preferences**
   - Key: `user:{user_id}:prefs`
   - Value: JSON with language, timezone, notification settings
   - TTL: 1 hour
   - Hit rate target: 95%

**Configuration**:
- Node Type: cache.t3.medium (2 vCPU, 3.09 GB RAM)
- Cluster Mode: Enabled with 2 shards, 1 replica per shard
- Eviction Policy: allkeys-lru (least recently used)
- Max Memory: 2.5 GB per node

**S3 (Document Storage)**

Bucket structure:

```
dawaisathi-documents-{env}/
├── prescriptions/
│   ├── {user_id}/
│   │   └── {timestamp}_{filename}.jpg
├── barcodes/
│   ├── {user_id}/
│   │   └── {timestamp}_{filename}.jpg
├── medical-records/
│   ├── {user_id}/
│   │   ├── lab-reports/
│   │   ├── bills/
│   │   └── consultations/
└── exports/
    └── {user_id}/
        └── {timestamp}_data_export.zip
```

**Configuration**:
- Encryption: SSE-KMS with customer-managed key
- Versioning: Enabled for audit compliance
- Lifecycle Policies:
  - Move to S3 Intelligent-Tiering after 30 days
  - Move to Glacier after 90 days
  - Delete after 7 years (compliance requirement)
- Access: Pre-signed URLs with 15-minute expiry
- CORS: Enabled for web dashboard uploads

#### 4. AI/ML Services

**AWS Textract (OCR)**
- **Use Case**: Extract text from prescription images (FR-1, FR-19)
- **API**: `AnalyzeDocument` with FORMS and TABLES features
- **Configuration**: Async processing for images >5MB
- **Accuracy**: 95%+ for printed text, 80%+ for handwritten
- **Cost Optimization**: Use `DetectDocumentText` for simple prescriptions (50% cheaper)

**AWS Comprehend Medical**
- **Use Case**: Extract medical entities (medicines, dosages, frequencies) (FR-1)
- **API**: `DetectEntitiesV2` for medical entity recognition
- **Entities Extracted**: MEDICATION, DOSAGE, FREQUENCY, DURATION, ROUTE_OR_MODE
- **Confidence Threshold**: 0.85 (flag lower confidence for manual review)
- **Language**: English only (translate Regional_Language prescriptions first)

**AWS Rekognition**
- **Use Case**: Barcode/QR code detection for authenticity verification (FR-15)
- **API**: `DetectText` for barcode numbers
- **Accuracy**: 98%+ for clear barcodes
- **Fallback**: Manual entry if detection fails

**Claude API (Anthropic)**
- **Use Case**: Medicine explanations, multilingual translation, medical abbreviation decoding (FR-2, FR-12)
- **Model**: Claude 3 Haiku (fast, cost-effective) for explanations
- **Prompt Template**:
  ```
  Explain the medicine {medicine_name} in {language} at 8th-grade reading level.
  Include: purpose, usage instructions, common side effects, precautions.
  Keep explanation under 200 words.
  ```
- **Rate Limiting**: 100 requests/minute
- **Cost**: ~$0.25 per 1M input tokens, $1.25 per 1M output tokens
- **Caching**: Cache all explanations in ElastiCache Redis


#### 5. Scheduling and Orchestration

**EventBridge (Scheduler)**

Rules configuration:

1. **Medication Reminders** (FR-4)
   - Rule Pattern: Cron expressions per user/medicine
   - Example: `cron(0 8,14,20 * * ? *)` for TDS (three times daily)
   - Target: Lambda ReminderSender
   - Dynamic Rules: Created/updated via API when medicines added
   - Naming: `reminder-{user_id}-{medicine_id}-{time}`

2. **Missed Dose Detection** (FR-6)
   - Rule Pattern: `rate(15 minutes)`
   - Target: Lambda MissedDoseDetector
   - Purpose: Check for unconfirmed doses every 15 minutes

3. **Daily Adherence Calculation** (FR-8)
   - Rule Pattern: `cron(0 1 * * ? *)` (1 AM IST daily)
   - Target: Lambda AdherenceCalculator
   - Purpose: Calculate daily adherence scores for all patients

4. **Recall Monitoring** (FR-16)
   - Rule Pattern: `cron(0 6 * * ? *)` (6 AM IST daily)
   - Target: Lambda RecallMonitor
   - Purpose: Check FDA/CDSCO for new recall notices

5. **Refill Alerts** (FR-13)
   - Rule Pattern: `cron(0 9 * * ? *)` (9 AM IST daily)
   - Target: Lambda RefillChecker
   - Purpose: Check stock levels and send refill reminders

**Step Functions (Workflows)**

1. **Missed Dose Escalation Workflow** (FR-6)
   ```json
   {
     "Comment": "Escalate missed dose notifications",
     "StartAt": "WaitOneHour",
     "States": {
       "WaitOneHour": {
         "Type": "Wait",
         "Seconds": 3600,
         "Next": "SendFirstFollowup"
       },
       "SendFirstFollowup": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:SendNotification",
         "Next": "CheckConfirmation1"
       },
       "CheckConfirmation1": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:CheckDoseStatus",
         "Next": "IsConfirmed1"
       },
       "IsConfirmed1": {
         "Type": "Choice",
         "Choices": [
           {
             "Variable": "$.confirmed",
             "BooleanEquals": true,
             "Next": "Success"
           }
         ],
         "Default": "WaitThreeHours"
       },
       "WaitThreeHours": {
         "Type": "Wait",
         "Seconds": 10800,
         "Next": "SendSecondFollowup"
       },
       "SendSecondFollowup": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:SendNotification",
         "Next": "CheckConfirmation2"
       },
       "CheckConfirmation2": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:CheckDoseStatus",
         "Next": "IsConfirmed2"
       },
       "IsConfirmed2": {
         "Type": "Choice",
         "Choices": [
           {
             "Variable": "$.confirmed",
             "BooleanEquals": true,
             "Next": "Success"
           }
         ],
         "Default": "NotifyCaregiver"
       },
       "NotifyCaregiver": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:NotifyCaregiver",
         "Next": "Success"
       },
       "Success": {
         "Type": "Succeed"
       }
     }
   }
   ```

2. **Prescription Processing Workflow** (FR-1)
   - Steps: Upload → OCR → Entity Extraction → Validation → Explanation → Notification
   - Error Handling: Retry OCR 3 times, fallback to manual review
   - Duration: 10-30 seconds

3. **Teleconsultation Booking Workflow** (FR-17)
   - Steps: Check Availability → Process Payment → Confirm Booking → Send Notifications → Generate Pre-Brief
   - Error Handling: Refund on failure, retry notifications
   - Duration: 5-15 seconds

#### 6. Notification Services

**SNS (SMS and Push Notifications)**

Topics:

1. **Critical Alerts** (FR-6, FR-7, FR-16)
   - Subscribers: Patient phone, caregiver phones
   - Use Cases: Missed critical doses, drug recalls, severe interactions
   - Delivery: SMS with 99.9% delivery rate

2. **Daily Summaries** (FR-7)
   - Subscribers: Caregiver emails
   - Use Cases: Daily adherence reports, weekly summaries
   - Delivery: Email via SES

**SES (Email Notifications)**

Templates:

1. **Adherence Report** (FR-8)
   - Frequency: Weekly
   - Content: Adherence score, missed doses, upcoming refills
   - Format: HTML with charts

2. **Doctor Pre-Brief** (FR-18)
   - Trigger: Teleconsultation booking
   - Content: Patient history, current medicines, adherence data
   - Format: PDF attachment

3. **Recall Alert** (FR-16)
   - Trigger: Medicine recall detected
   - Content: Recall details, health risks, action items
   - Priority: High

**Twilio/360Dialog (WhatsApp)**

Message types:

1. **Reminders** (FR-4)
   - Format: Text with quick reply buttons (Yes/No)
   - Example: "Time to take Metformin 500mg. Have you taken it? [Yes] [No]"

2. **Explanations** (FR-2)
   - Format: Text in Regional_Language
   - Example: "मेटफॉर्मिन (Metformin) - यह दवा टाइप 2 डायबिटीज के लिए है..."

3. **Alerts** (FR-6, FR-10, FR-16)
   - Format: Text with action buttons
   - Example: "⚠️ Drug Interaction Warning: Aspirin + Ibuprofen can cause bleeding. [Call Doctor] [More Info]"

4. **Interactive Menus**
   - Format: List messages with options
   - Example: "What would you like to do? 1. Add Medicine 2. View Schedule 3. Check Adherence"

## Components and Interfaces

### WhatsApp Bot Interface

**Conversation Flow**:

```
User: [Sends prescription image]
Bot: "I've received your prescription. Processing... ⏳"
     [10 seconds later]
     "Found 3 medicines:
     1. Metformin 500mg - Twice daily after meals
     2. Aspirin 75mg - Once daily after breakfast
     3. Atorvastatin 10mg - Once daily at bedtime
     
     Would you like explanations in Hindi? [Yes] [No]"

User: [Clicks Yes]
Bot: "मेटफॉर्मिन (Metformin) 500mg
     उद्देश्य: टाइप 2 डायबिटीज को नियंत्रित करने के लिए
     कैसे लें: दिन में 2 बार, खाने के बाद
     सावधानियां: खाली पेट न लें, शराब से बचें
     
     💰 Generic Option: ₹50/month की बचत!
     
     [Next Medicine] [Set Reminders]"

User: [Clicks Set Reminders]
Bot: "What time do you usually have breakfast? [8 AM] [9 AM] [10 AM] [Other]"

User: [Clicks 8 AM]
Bot: "Great! I'll remind you at:
     • 8:30 AM - Metformin + Aspirin (after breakfast)
     • 1:30 PM - Metformin (after lunch)
     • 10:00 PM - Atorvastatin (bedtime)
     
     ✅ Reminders set! You'll get notifications 15 minutes before each dose."
```

**Command Structure**:

- `/add` - Add new medicine manually
- `/schedule` - View today's medicine schedule
- `/adherence` - Check adherence score
- `/refill` - Check stock levels and refill reminders
- `/pharmacy` - Find nearby pharmacies
- `/help` - Show available commands
- `/language` - Change language preference

**State Management**:
- Store conversation context in DynamoDB `whatsapp_sessions` table
- Track user intent, current step, and temporary data
- Session timeout: 24 hours

### Web Dashboard Interface

**Technology Stack**:
- Framework: Next.js 14 (App Router)
- UI Library: Tailwind CSS + shadcn/ui components
- Charts: Recharts for adherence visualization
- State Management: React Context + TanStack Query
- Authentication: AWS Amplify (Cognito integration)

**Pages**:

1. **Dashboard** (`/dashboard`)
   - Today's medicine schedule with status indicators
   - Adherence score gauge (daily, weekly, monthly)
   - Upcoming refills and low stock alerts
   - Recent notifications and alerts

2. **Medicines** (`/medicines`)
   - List of all active medicines with details
   - Add/edit/delete medicine functionality
   - View generic alternatives and cost savings
   - Drug interaction warnings

3. **Adherence** (`/adherence`)
   - Calendar view with daily adherence scores
   - Line chart showing adherence trends
   - Missed dose patterns analysis
   - Export adherence report (PDF)

4. **Family** (`/family`)
   - Multi-patient switcher
   - Add/remove family members
   - Manage caregiver access
   - Consolidated family view

5. **Documents** (`/documents`)
   - Upload and organize medical documents
   - Search by date, type, or doctor
   - View extracted information
   - Download or share documents

6. **Settings** (`/settings`)
   - Profile information
   - Language and timezone preferences
   - Notification settings
   - Privacy and data export

**API Integration**:

```typescript
// Example API client
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// API methods
export const medicineAPI = {
  list: (patientId: string) => 
    apiClient.get(`/medicines?patient_id=${patientId}`),
  
  create: (data: MedicineInput) => 
    apiClient.post('/medicines', data),
  
  update: (id: string, data: Partial<MedicineInput>) => 
    apiClient.put(`/medicines/${id}`, data),
  
  delete: (id: string) => 
    apiClient.delete(`/medicines/${id}`),
  
  getGenerics: (medicineId: string) => 
    apiClient.get(`/medicines/${medicineId}/generics`),
};

export const adherenceAPI = {
  getScore: (patientId: string, period: 'daily' | 'weekly' | 'monthly') => 
    apiClient.get(`/adherence/${patientId}?period=${period}`),
  
  getHistory: (patientId: string, startDate: string, endDate: string) => 
    apiClient.get(`/adherence/${patientId}/history?start=${startDate}&end=${endDate}`),
};
```

### External API Integrations

**1. DrugBank API (Drug Interactions)**

```typescript
interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'severe' | 'moderate' | 'mild';
  description: string;
  mechanism: string;
  management: string;
}

async function checkDrugInteractions(
  medicines: string[]
): Promise<DrugInteraction[]> {
  // Check cache first
  const cacheKey = `interactions:${medicines.sort().join(':')}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Call DrugBank API
  const response = await axios.post(
    'https://api.drugbank.com/v1/interactions',
    { drugs: medicines },
    {
      headers: {
        'Authorization': `Bearer ${process.env.DRUGBANK_API_KEY}`,
      },
    }
  );

  const interactions = response.data.interactions;

  // Cache for 7 days
  await redis.setex(cacheKey, 7 * 24 * 60 * 60, JSON.stringify(interactions));

  return interactions;
}
```

**2. RxNorm API (Generic Mappings)**

```typescript
interface GenericAlternative {
  brandName: string;
  genericName: string;
  activeIngredient: string;
  brandPrice: number;
  genericPrice: number;
  savings: number;
}

async function findGenericAlternatives(
  brandName: string
): Promise<GenericAlternative[]> {
  // Check cache
  const cacheKey = `generic:${brandName.toLowerCase()}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Call RxNorm API to get RxCUI
  const rxcuiResponse = await axios.get(
    `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(brandName)}`
  );
  const rxcui = rxcuiResponse.data.idGroup.rxnormId[0];

  // Get related generic drugs
  const relatedResponse = await axios.get(
    `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=SCD+SBD`
  );

  const alternatives = relatedResponse.data.relatedGroup.conceptGroup
    .flatMap(group => group.conceptProperties || [])
    .map(concept => ({
      brandName,
      genericName: concept.name,
      activeIngredient: concept.synonym,
      // Fetch prices from pharmacy APIs
      brandPrice: 0, // TODO: Integrate with pharmacy API
      genericPrice: 0,
      savings: 0,
    }));

  // Cache for 24 hours
  await redis.setex(cacheKey, 24 * 60 * 60, JSON.stringify(alternatives));

  return alternatives;
}
```

**3. Pharmacy APIs (1mg, PharmEasy)**

```typescript
interface Pharmacy {
  name: string;
  address: string;
  distance: number;
  phone: string;
  stockAvailable: boolean;
  estimatedPrice: number;
}

async function findNearbyPharmacies(
  latitude: number,
  longitude: number,
  medicineName: string,
  radius: number = 5000 // meters
): Promise<Pharmacy[]> {
  // Call 1mg API
  const oneMgResponse = await axios.get(
    'https://api.1mg.com/v1/pharmacies/nearby',
    {
      params: { lat: latitude, lng: longitude, radius, medicine: medicineName },
      headers: { 'X-API-Key': process.env.ONEMG_API_KEY },
    }
  );

  // Call PharmEasy API
  const pharmEasyResponse = await axios.get(
    'https://api.pharmeasy.in/v1/stores/search',
    {
      params: { lat: latitude, lng: longitude, radius, product: medicineName },
      headers: { 'Authorization': `Bearer ${process.env.PHARMEASY_API_KEY}` },
    }
  );

  // Combine and deduplicate results
  const pharmacies = [
    ...oneMgResponse.data.pharmacies,
    ...pharmEasyResponse.data.stores,
  ].map(p => ({
    name: p.name,
    address: p.address,
    distance: p.distance,
    phone: p.phone,
    stockAvailable: p.stock_status === 'available',
    estimatedPrice: p.price,
  }));

  // Sort by distance
  return pharmacies.sort((a, b) => a.distance - b.distance);
}
```

**4. Claude API (Explanations)**

```typescript
interface MedicineExplanation {
  medicine: string;
  language: string;
  purpose: string;
  usage: string;
  sideEffects: string;
  precautions: string;
}

async function explainMedicine(
  medicineName: string,
  language: string
): Promise<MedicineExplanation> {
  // Check cache
  const cacheKey = `explain:${medicineName}:${language}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const prompt = `Explain the medicine "${medicineName}" in ${language} at an 8th-grade reading level.

Include:
1. Purpose: What is this medicine used for?
2. Usage: How should it be taken?
3. Side Effects: Common side effects to watch for
4. Precautions: Important warnings and things to avoid

Keep the explanation under 200 words and use simple language.`;

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [
        { role: 'user', content: prompt }
      ],
    },
    {
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );

  const explanation = parseClaudeResponse(response.data.content[0].text);

  // Cache for 30 days
  await redis.setex(cacheKey, 30 * 24 * 60 * 60, JSON.stringify(explanation));

  return explanation;
}

function parseClaudeResponse(text: string): MedicineExplanation {
  // Parse structured response from Claude
  const sections = text.split('\n\n');
  return {
    medicine: '',
    language: '',
    purpose: sections[0] || '',
    usage: sections[1] || '',
    sideEffects: sections[2] || '',
    precautions: sections[3] || '',
  };
}
```

## Data Models

### Core Domain Models

```typescript
// User and Patient models
interface User {
  userId: string;
  phoneNumber: string;
  email?: string;
  preferredLanguage: Language;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Patient {
  patientId: string;
  userId: string;
  name: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  isPrimary: boolean;
  createdAt: Date;
}

// Medicine models
interface Medicine {
  medicineId: string;
  patientId: string;
  name: string;
  genericName?: string;
  dosage: string; // e.g., "500mg"
  frequency: Frequency; // OD, BD, TDS, QID
  timing: Timing; // AC, PC, HS, PRN
  durationDays?: number;
  stockLevel: number;
  startDate: Date;
  endDate?: Date;
  isActive: boolean;
  prescriptionImageS3Key?: string;
  createdAt: Date;
}

type Frequency = 'OD' | 'BD' | 'TDS' | 'QID' | 'CUSTOM';
type Timing = 'AC' | 'PC' | 'HS' | 'PRN' | 'CUSTOM';

interface Reminder {
  reminderId: string;
  medicineId: string;
  scheduledTime: string; // HH:MM format
  eventBridgeRuleName: string;
  isActive: boolean;
  createdAt: Date;
}

// Adherence models
interface Dose {
  doseId: string;
  medicineId: string;
  scheduledTime: Date;
  confirmedTime?: Date;
  status: DoseStatus;
  confirmationMethod?: 'whatsapp' | 'web' | 'sms';
  notes?: string;
  createdAt: Date;
}

type DoseStatus = 'pending' | 'confirmed' | 'missed' | 'skipped';

interface AdherenceScore {
  scoreId: string;
  patientId: string;
  date: Date;
  totalDoses: number;
  confirmedDoses: number;
  missedDoses: number;
  scorePercentage: number; // 0-100
}

// Caregiver models
interface Caregiver {
  caregiverId: string;
  patientId: string;
  userId: string;
  relationship: string;
  alertPreferences: AlertPreferences;
  status: 'pending' | 'active' | 'inactive';
  createdAt: Date;
}

interface AlertPreferences {
  critical: boolean;
  daily: boolean;
  weekly: boolean;
  channels: ('whatsapp' | 'sms' | 'email')[];
}

// Document models
interface Document {
  documentId: string;
  patientId: string;
  documentType: DocumentType;
  s3Key: string;
  extractedText?: string;
  metadata: Record<string, any>;
  uploadedAt: Date;
}

type DocumentType = 'prescription' | 'lab_report' | 'bill' | 'consultation' | 'other';

// Drug interaction models
interface DrugInteraction {
  interactionId: string;
  drug1Name: string;
  drug2Name: string;
  severity: 'severe' | 'moderate' | 'mild';
  description: string;
  source: string;
  cachedAt: Date;
}
```

### Event Models (EventBridge)

```typescript
// Reminder event
interface ReminderEvent {
  eventType: 'medication_reminder';
  userId: string;
  patientId: string;
  medicineId: string;
  medicineName: string;
  dosage: string;
  scheduledTime: string;
  reminderType: 'primary' | 'followup';
}

// Missed dose event
interface MissedDoseEvent {
  eventType: 'missed_dose';
  userId: string;
  patientId: string;
  doseId: string;
  medicineId: string;
  medicineName: string;
  scheduledTime: string;
  missedDuration: number; // minutes
  isCritical: boolean;
}

// Recall alert event
interface RecallAlertEvent {
  eventType: 'medicine_recall';
  userId: string;
  patientId: string;
  medicineId: string;
  medicineName: string;
  recallReason: string;
  severity: 'critical' | 'high' | 'medium';
  source: 'FDA' | 'CDSCO';
  actionRequired: string;
}
```


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Core System Properties

**Property 1: Image Storage Timing**
*For any* valid prescription image under 10MB in supported formats (JPEG, PNG, PDF), uploading the image should result in storage completion within 2 seconds.
**Validates: Requirements 1.1, 1.6**

**Property 2: OCR Processing Timing**
*For any* stored prescription image, OCR text extraction should complete within 5 seconds of storage.
**Validates: Requirements 1.2**

**Property 3: End-to-End Prescription Processing**
*For any* prescription image upload, the complete processing pipeline (upload → storage → OCR → entity extraction → summary generation) should complete within 10 seconds.
**Validates: Requirements 1.7**

**Property 4: Image Format Support**
*For any* file in JPEG, PNG, or PDF format under 10MB, the system should accept and process it; for any file over 10MB or in unsupported format, the system should reject it with appropriate error message.
**Validates: Requirements 1.6**

**Property 5: Poor Quality Image Handling**
*For any* prescription image with insufficient quality (low resolution, blur, poor lighting), the system should detect the quality issue and request a clearer image with specific guidance.
**Validates: Requirements 1.4**

**Property 6: Medicine Validation**
*For any* list of extracted medicine names, each medicine should be validated against the Drug_Database, and any unrecognized medicines should be flagged for manual review.
**Validates: Requirements 1.5**

### Language and Explanation Properties

**Property 7: Language Preference Persistence**
*For any* user and Regional_Language selection, setting the language preference should persist in the database and be applied to all subsequent communications for that user.
**Validates: Requirements 2.1**

**Property 8: Multilingual Explanation Generation**
*For any* medicine and Regional_Language (Hindi, English, Tamil, Telugu, Marathi, Bengali, Gujarati, Kannada), the system should generate an explanation in that language within 8 seconds.
**Validates: Requirements 2.2, 2.3**

**Property 9: Explanation Completeness**
*For any* medicine explanation generated, the output should include all required sections: purpose, usage instructions, common side effects, and precautions.
**Validates: Requirements 2.4**

**Property 10: Explanation Fallback**
*For any* medicine explanation request, if the AI_Service fails to generate an explanation in the requested Regional_Language, the system should fall back to English and notify the user of the fallback.
**Validates: Requirements 2.5**

**Property 11: Voice Output Generation**
*For any* medicine explanation and voice output request, the system should generate audio output in the user's Regional_Language using Text-to-Speech.
**Validates: Requirements 2.6**

### Generic Medicine and Cost Properties

**Property 12: Generic Lookup Timing**
*For any* brand-name medicine, querying for generic alternatives should complete within 3 seconds.
**Validates: Requirements 3.1**

**Property 13: Generic Information Completeness**
*For any* generic medicine alternative found, the display should include brand name, generic name, price comparison, and potential savings in the user's Regional_Language.
**Validates: Requirements 3.2**

**Property 14: Monthly Savings Calculation**
*For any* set of medicines with generic alternatives, the total monthly savings calculation should equal the sum of individual medicine savings when all are switched to generics.
**Validates: Requirements 3.3**

**Property 15: Generic Cache Behavior**
*For any* brand medicine, the first generic lookup should query the Drug_Database, subsequent lookups within 24 hours should use cached data, and lookups after 24 hours should refresh the cache.
**Validates: Requirements 3.5**

**Property 16: Generic Disclaimer Presence**
*For any* generic alternative display, the output should include a disclaimer advising the user to consult their doctor before switching medicines.
**Validates: Requirements 3.6**

**Property 17: Cumulative Savings Tracking**
*For any* user who switches to generic medicines, the system should track and accumulate cost savings over time, and display the cumulative total in the Web_Dashboard.
**Validates: Requirements 3.7**

### Reminder and Scheduling Properties

**Property 18: Reminder Creation**
*For any* medicine added with timing instructions (frequency and timing), the system should create corresponding scheduled reminder events in EventBridge.
**Validates: Requirements 4.1**

**Property 19: Meal-Based Scheduling**
*For any* medicine with food timing requirements (AC/PC), the system should prompt the user for meal times and adjust reminder schedules to align with those meal times.
**Validates: Requirements 4.2**

**Property 20: Reminder Notification Delivery**
*For any* scheduled reminder time, the system should send a notification via WhatsApp 15 minutes before the scheduled dose time.
**Validates: Requirements 4.3, 4.4**

**Property 21: Reminder Grouping**
*For any* set of medicines with the same scheduled time, the system should combine them into a single reminder notification rather than sending separate notifications.
**Validates: Requirements 4.5**

**Property 22: Follow-up Notification Timing**
*For any* reminder where dose confirmation is not received within 30 minutes, the system should send a follow-up notification.
**Validates: Requirements 4.6**

**Property 23: Bulk Reminder Rescheduling**
*For any* user with multiple active reminders, a single reschedule command should update all reminder times according to the new schedule.
**Validates: Requirements 4.7**

### Dose Tracking and Adherence Properties

**Property 24: Confirmation Button Presence**
*For any* reminder notification sent, the message should include Yes/No confirmation buttons in the WhatsApp interface.
**Validates: Requirements 5.1**

**Property 25: Dose Confirmation Recording**
*For any* dose confirmation (Yes or No), the system should record the timestamp, medicine name, and confirmation status in the database within 1 second.
**Validates: Requirements 5.2**

**Property 26: Missed Dose Guidance**
*For any* dose marked as missed by the user, the system should ask for the reason and provide guidance on whether to take it late or skip it.
**Validates: Requirements 5.3**

**Property 27: Adherence Score Calculation**
*For any* patient and time period (daily, weekly, monthly), the adherence score should equal (confirmed doses / total scheduled doses) × 100.
**Validates: Requirements 5.4**

**Property 28: Low Adherence Alerting**
*For any* patient whose adherence score falls below 80% for 3 consecutive days, the system should send alerts to both the patient and designated caregivers.
**Validates: Requirements 5.5**

**Property 29: Adherence Dashboard Display**
*For any* patient, the Web_Dashboard should display adherence score and dose history with visual charts.
**Validates: Requirements 5.6**

**Property 30: Doctor Report Generation**
*For any* doctor request for patient history, the system should generate a report showing adherence score and missed dose patterns for the past 30 days within 5 seconds.
**Validates: Requirements 5.7**

### Missed Dose Detection Properties

**Property 31: Missed Dose Detection Timing**
*For any* scheduled dose where confirmation is not received within 60 minutes, the system should automatically mark the dose as missed in the database.
**Validates: Requirements 6.1**

**Property 32: Missed Dose Workflow Triggering**
*For any* dose marked as missed, the system should trigger a Step Function workflow to send escalating follow-up notifications.
**Validates: Requirements 6.2**

**Property 33: Escalation Notification Timing**
*For any* missed dose, the system should send follow-up notifications at 1 hour, 3 hours, and 6 hours after the missed dose time.
**Validates: Requirements 6.3**

**Property 34: Critical Dose Caregiver Alert**
*For any* critical medicine dose that is missed, the system should immediately notify all designated caregivers without waiting for escalation timing.
**Validates: Requirements 6.4**

**Property 35: Consecutive Miss Detection**
*For any* medicine where a patient misses 2 consecutive scheduled doses, the system should send an alert to caregivers and suggest doctor consultation.
**Validates: Requirements 6.5**

**Property 36: Retroactive Dose Confirmation**
*For any* dose marked as missed, the system should allow the user to retroactively mark it as "taken but not confirmed" within 24 hours of the scheduled time.
**Validates: Requirements 6.6**

### Caregiver Management Properties

**Property 37: Caregiver Registration Limit**
*For any* patient registration, the system should allow designation of up to 3 caregivers with phone numbers and email addresses, and reject attempts to add more than 3.
**Validates: Requirements 7.1**

**Property 38: Caregiver Invitation Flow**
*For any* caregiver designation, the system should send an invitation via SMS/email that requires acceptance before activating alerts for that caregiver.
**Validates: Requirements 7.2**

**Property 39: Critical Alert Distribution**
*For any* critical medicine dose that is missed, the system should send immediate alerts to all designated caregivers via both WhatsApp and SMS.
**Validates: Requirements 7.3**

**Property 40: Low Adherence Reporting**
*For any* patient whose adherence score drops below 70%, the system should send weekly summary reports to all designated caregivers via email.
**Validates: Requirements 7.4**

**Property 41: Caregiver Dashboard Access**
*For any* authenticated caregiver, the system should allow viewing of the patient's medication schedule and adherence score in the Web_Dashboard.
**Validates: Requirements 7.5**

**Property 42: Intervention Recording**
*For any* caregiver who confirms they have intervened, the system should record the intervention and pause escalation notifications for that missed dose.
**Validates: Requirements 7.6**

**Property 43: Privacy Settings Enforcement**
*For any* patient with privacy settings configured, the system should restrict caregiver access to only the information the patient has explicitly authorized.
**Validates: Requirements 7.7, 22.7**

### Drug Interaction Properties

**Property 44: Interaction Checking on Medicine Addition**
*For any* new medicine added to a patient's regimen, the system should check for drug interactions with all existing medicines in the regimen using the Drug_Database.
**Validates: Requirements 10.1, 10.2**

**Property 45: Severe Interaction Alerting**
*For any* severe drug interaction detected, the system should immediately alert the user and recommend urgent doctor consultation before taking the medicine.
**Validates: Requirements 10.3**

**Property 46: Moderate Interaction Warning**
*For any* moderate drug interaction detected, the system should warn the user and suggest discussing with their doctor at the next appointment.
**Validates: Requirements 10.4**

**Property 47: Interaction Explanation Completeness**
*For any* drug interaction detected, the explanation provided should be in the user's Regional_Language and include symptoms to watch for.
**Validates: Requirements 10.5**

**Property 48: Interaction Cache Behavior**
*For any* drug pair, the first interaction check should query DrugBank API, subsequent checks within 7 days should use cached data, and checks after 7 days should refresh the cache.
**Validates: Requirements 10.6**

**Property 49: Interaction Warning Suppression**
*For any* drug interaction where the user confirms doctor consultation, the system should record the confirmation and suppress future warnings for that specific drug combination.
**Validates: Requirements 10.7**

### Duplicate Medicine Detection Properties

**Property 50: Active Ingredient Extraction**
*For any* medicine added, the system should extract the active pharmaceutical ingredient using the Drug_Database.
**Validates: Requirements 11.1**

**Property 51: Duplicate Detection Across Brands**
*For any* new medicine added, if the active ingredient matches an existing medicine in the patient's regimen (including brand-to-generic matches), the system should alert the user immediately.
**Validates: Requirements 11.2, 11.3, 11.7**

**Property 52: Duplicate Alert Completeness**
*For any* duplicate medicine detected, the alert should display both medicine names, their active ingredients, and dosages for comparison.
**Validates: Requirements 11.4**

**Property 53: Duplicate Confirmation Flow**
*For any* duplicate detected, the system should ask the user to confirm whether it's intentional (dosage adjustment) or an error.
**Validates: Requirements 11.5**

**Property 54: Duplicate Error Handling**
*For any* duplicate confirmed as an error, the system should suggest removing one medicine and offer to contact the prescribing doctor.
**Validates: Requirements 11.6**

### Stock Management and Refill Properties

**Property 55: Stock Initialization**
*For any* medicine added, the system should prompt the user for initial stock level (number of tablets/doses).
**Validates: Requirements 13.1**

**Property 56: Stock Decrement on Dose Confirmation**
*For any* dose confirmed as taken, the system should automatically decrement the medicine's stock level by 1 in the database.
**Validates: Requirements 13.2**

**Property 57: Refill Date Calculation**
*For any* medicine with stock level S and daily consumption rate R, the refill date should be calculated as today + (S / R) days.
**Validates: Requirements 13.3**

**Property 58: Refill Reminder Thresholds**
*For any* medicine, when stock level reaches 7 days remaining, the system should send a first refill reminder; when it reaches 3 days, send an urgent reminder with pharmacy locator; when it reaches zero, send critical alert to user and caregiver.
**Validates: Requirements 13.4, 13.5, 13.6**

**Property 59: Manual Stock Update**
*For any* medicine, the system should allow the user to manually update the stock level when they purchase refills.
**Validates: Requirements 13.7**

### Medicine Authenticity Properties

**Property 60: Barcode Extraction**
*For any* image of a medicine barcode or QR code, the system should use AWS Rekognition to extract the barcode number.
**Validates: Requirements 15.1**

**Property 61: Authenticity Verification**
*For any* extracted barcode, the system should query government databases (CDSCO, FDA) and manufacturer APIs to verify authenticity.
**Validates: Requirements 15.2**

**Property 62: Authentic Medicine Confirmation**
*For any* barcode verified as authentic, the system should display confirmation with manufacturer details, batch number, and expiry date.
**Validates: Requirements 15.3**

**Property 63: Counterfeit Medicine Warning**
*For any* barcode not found in authentic product databases, the system should warn the user about potential counterfeit medicine and provide guidance on reporting and alternative sources.
**Validates: Requirements 15.4, 15.5**

**Property 64: Verification History Logging**
*For any* barcode verification performed, the system should store the verification result in the database for tracking counterfeit detection patterns.
**Validates: Requirements 15.6**

**Property 65: Verification Timing**
*For any* barcode image received, the complete verification process should complete within 8 seconds.
**Validates: Requirements 15.7**

### Document Management Properties

**Property 66: Document Storage Support**
*For any* document type (prescription, lab report, medical bill, consultation note), the system should provide secure encrypted storage in S3.
**Validates: Requirements 21.1, 21.5**

**Property 67: Automatic Document Categorization**
*For any* document uploaded, the system should automatically categorize it by type using OCR and store the category in the database.
**Validates: Requirements 21.2**

**Property 68: Metadata Extraction and Indexing**
*For any* document uploaded, the system should extract and index key metadata (date, doctor name, hospital, diagnosis, medicines) for searchability.
**Validates: Requirements 21.3**

**Property 69: Document Search Performance**
*For any* search query on medical records, the system should return filtered results within 2 seconds.
**Validates: Requirements 21.4**

**Property 70: Document Sharing**
*For any* document, the system should allow users to generate secure time-limited share links for doctors or caregivers.
**Validates: Requirements 21.6**

**Property 71: Document Export**
*For any* user, the system should allow downloading all medical records in ABDM-compliant format with version history.
**Validates: Requirements 21.7**

### Multi-Patient Dashboard Properties

**Property 72: Multi-Patient Linking Limit**
*For any* caregiver account, the system should allow linking up to 5 patient profiles and reject attempts to link more than 5.
**Validates: Requirements 22.1**

**Property 73: Family Dashboard Overview**
*For any* caregiver with linked patients, the Web_Dashboard should display an overview showing today's medicine schedule and adherence score for all linked patients.
**Validates: Requirements 22.2**

**Property 74: Urgent Item Highlighting**
*For any* family dashboard view, the system should highlight urgent items including missed doses, low stock levels, and upcoming refills across all linked patients.
**Validates: Requirements 22.3**

**Property 75: Patient Profile Switching**
*For any* caregiver with multiple linked patients, the system should allow switching between patient profiles to view detailed medication information.
**Validates: Requirements 22.4**

**Property 76: Consolidated Family Notifications**
*For any* reminder time when multiple linked patients have pending doses, the system should send a single consolidated notification to the caregiver listing all pending doses.
**Validates: Requirements 22.5**

**Property 77: Family-Level Analytics**
*For any* caregiver account with linked patients, the system should provide aggregated analytics showing total cost savings, overall adherence trends, and upcoming appointments across all patients.
**Validates: Requirements 22.6**

### Performance Properties

**Property 78: WhatsApp Response Time**
*For any* 100 consecutive WhatsApp messages, at least 95 should receive responses within 3 seconds.
**Validates: Requirements NFR-1.1**

**Property 79: OCR Processing Performance**
*For any* prescription image under 5MB, the OCR processing should complete and return results within 10 seconds.
**Validates: Requirements NFR-1.2**

**Property 80: Database Query Performance**
*For any* 100 consecutive database queries, at least 99 should complete within 500ms.
**Validates: Requirements NFR-1.4**

**Property 81: Reminder Delivery Timing**
*For any* scheduled reminder, the notification should be delivered within 30 seconds of the scheduled time.
**Validates: Requirements NFR-1.5**

**Property 82: Cache Hit Rate**
*For any* 100 consecutive requests for frequently accessed data (generic mappings, drug interactions, user preferences), at least 80 should be served from cache.
**Validates: Requirements NFR-1.6**

**Property 83: API Gateway Latency**
*For any* 100 consecutive API Gateway requests, at least 99 should complete with latency under 1 second.
**Validates: Requirements NFR-1.7**


## Error Handling

### Error Categories and Strategies

#### 1. User Input Errors

**Poor Quality Prescription Images**
- Detection: OCR confidence score < 0.7
- Response: Request clearer image with specific guidance ("Please ensure good lighting and focus")
- Fallback: Offer manual medicine entry option
- Logging: Log image quality metrics for analysis

**Invalid Medicine Names**
- Detection: Medicine not found in Drug_Database
- Response: Flag for manual review, ask user to verify spelling
- Fallback: Allow manual entry with warning about interaction checking limitations
- Logging: Track unrecognized medicines for database updates

**Malformed User Input**
- Detection: Input validation failures (invalid phone numbers, dates, etc.)
- Response: Clear error message with expected format
- Fallback: Provide examples of valid input
- Logging: Track validation failures by field

#### 2. External Service Failures

**WhatsApp API Unavailable**
- Detection: HTTP 5xx errors or timeouts from Twilio/360Dialog
- Response: Queue message in SQS for retry
- Fallback: Send via SMS (SNS), then email (SES)
- Retry Strategy: Exponential backoff (1s, 2s, 4s, 8s, 16s)
- Circuit Breaker: Open after 5 consecutive failures, half-open after 60s

**Claude API Failures**
- Detection: API errors or timeouts
- Response: Use cached explanation if available
- Fallback: Return English explanation with apology message
- Retry Strategy: 3 retries with exponential backoff
- Logging: Track API failures and response times

**DrugBank API Rate Limiting**
- Detection: HTTP 429 responses
- Response: Use cached interaction data if available
- Fallback: Display generic warning about checking with doctor
- Retry Strategy: Respect Retry-After header, exponential backoff
- Caching: Aggressive caching (7 days) to reduce API calls

**Pharmacy API Unavailable**
- Detection: API timeouts or errors
- Response: Show cached pharmacy list if available
- Fallback: Provide Google Maps link for manual search
- Retry Strategy: 2 retries with 2s delay
- Logging: Track API availability by provider

#### 3. AWS Service Failures

**Lambda Timeout**
- Detection: Lambda execution exceeds timeout (30s max)
- Response: Log partial results, return error to user
- Fallback: Retry with increased timeout or split into smaller operations
- Monitoring: CloudWatch alarm on timeout rate > 1%

**RDS Connection Pool Exhaustion**
- Detection: Connection acquisition timeout
- Response: Queue request in SQS for delayed processing
- Fallback: Use read replica for read operations
- Scaling: Auto-scale RDS Proxy connections
- Monitoring: CloudWatch alarm on connection count > 80%

**S3 Upload Failures**
- Detection: S3 PutObject errors
- Response: Retry upload 3 times
- Fallback: Store in DynamoDB temporarily, sync to S3 later
- Logging: Track upload failures by error type

**EventBridge Rule Failures**
- Detection: Failed rule invocations
- Response: Dead letter queue (DLQ) for failed events
- Fallback: Manual trigger from monitoring dashboard
- Monitoring: CloudWatch alarm on DLQ message count > 0

**Textract OCR Failures**
- Detection: Textract API errors or low confidence
- Response: Retry with different Textract features
- Fallback: Request manual medicine entry
- Logging: Store failed images for model improvement

#### 4. Data Integrity Errors

**Duplicate Dose Confirmation**
- Detection: Dose already confirmed in database
- Response: Acknowledge but don't double-count in adherence
- Logging: Track duplicate confirmations for UX improvement

**Negative Stock Levels**
- Detection: Stock decrement would result in negative value
- Response: Set stock to 0, alert user about stock discrepancy
- Fallback: Prompt user to update stock level
- Logging: Track stock discrepancies for analysis

**Orphaned Reminders**
- Detection: Reminder exists for inactive medicine
- Response: Automatically disable reminder
- Cleanup: Daily job to remove orphaned reminders
- Logging: Track orphaned reminders for bug detection

**Inconsistent Adherence Scores**
- Detection: Calculated score doesn't match stored score
- Response: Recalculate and update stored score
- Fallback: Display calculated score with warning
- Monitoring: Alert on score discrepancies > 5%

#### 5. Security Errors

**Authentication Failures**
- Detection: Invalid JWT token or expired session
- Response: Return 401 Unauthorized, prompt re-login
- Fallback: Refresh token if available
- Logging: Track failed auth attempts by user
- Rate Limiting: Block IP after 10 failed attempts in 5 minutes

**Authorization Failures**
- Detection: User accessing unauthorized patient data
- Response: Return 403 Forbidden, log security event
- Fallback: None (security boundary)
- Monitoring: Alert on authorization failures > 10/hour

**Encryption Key Unavailable**
- Detection: KMS key access denied
- Response: Fail request, alert operations team
- Fallback: None (security requirement)
- Monitoring: Critical alert on KMS errors

### Error Response Format

All API errors follow consistent JSON format:

```json
{
  "error": {
    "code": "MEDICINE_NOT_FOUND",
    "message": "The medicine 'Asprin' was not found. Did you mean 'Aspirin'?",
    "details": {
      "suggestions": ["Aspirin", "Aspro"],
      "field": "medicine_name"
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

### Error Codes

| Code | HTTP Status | Description | User Action |
|------|-------------|-------------|-------------|
| INVALID_IMAGE_FORMAT | 400 | Unsupported image format | Upload JPEG, PNG, or PDF |
| IMAGE_TOO_LARGE | 400 | Image exceeds 10MB | Compress or resize image |
| POOR_IMAGE_QUALITY | 400 | OCR confidence too low | Take clearer photo |
| MEDICINE_NOT_FOUND | 404 | Medicine not in database | Verify spelling or enter manually |
| DUPLICATE_MEDICINE | 409 | Same active ingredient exists | Confirm intentional or remove |
| SEVERE_INTERACTION | 409 | Dangerous drug interaction | Consult doctor urgently |
| STOCK_DEPLETED | 409 | Medicine stock at zero | Purchase refill |
| AUTH_REQUIRED | 401 | Authentication needed | Log in again |
| FORBIDDEN | 403 | Access denied | Check permissions |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests | Wait and retry |
| SERVICE_UNAVAILABLE | 503 | External service down | Try again later |
| INTERNAL_ERROR | 500 | Unexpected system error | Contact support |

## Testing Strategy

### Dual Testing Approach

The DawaiSathi platform uses both unit testing and property-based testing to ensure comprehensive coverage:

- **Unit Tests**: Validate specific examples, edge cases, error conditions, and integration points
- **Property Tests**: Verify universal properties across all inputs through randomized testing
- Both approaches are complementary and necessary for production readiness

### Property-Based Testing

**Framework**: fast-check (JavaScript/TypeScript) for Lambda functions and web dashboard

**Configuration**:
- Minimum 100 iterations per property test (due to randomization)
- Seed-based reproducibility for failed tests
- Shrinking enabled to find minimal failing examples
- Timeout: 30 seconds per property test

**Test Organization**:
Each property test must:
1. Reference its design document property number
2. Use tag format: `Feature: dawaisathi-platform, Property {N}: {property_text}`
3. Generate random valid inputs using custom generators
4. Assert the property holds for all generated inputs

**Example Property Test**:

```typescript
import fc from 'fast-check';
import { describe, it } from '@jest/globals';
import { calculateAdherenceScore } from './adherence';

describe('Adherence Calculation', () => {
  it('Feature: dawaisathi-platform, Property 27: Adherence score calculation', () => {
    // Generate random dose data
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }), // total doses
        fc.integer({ min: 0, max: 100 }), // confirmed doses
        (totalDoses, confirmedDoses) => {
          // Ensure confirmed <= total
          const confirmed = Math.min(confirmedDoses, totalDoses);
          
          const score = calculateAdherenceScore(totalDoses, confirmed);
          
          // Property: score = (confirmed / total) * 100
          const expected = totalDoses === 0 ? 0 : (confirmed / totalDoses) * 100;
          
          expect(score).toBeCloseTo(expected, 2);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Custom Generators**:

```typescript
// Generator for valid medicine data
const medicineArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  dosage: fc.oneof(
    fc.constant('500mg'),
    fc.constant('10mg'),
    fc.constant('1g')
  ),
  frequency: fc.oneof(
    fc.constant('OD'),
    fc.constant('BD'),
    fc.constant('TDS'),
    fc.constant('QID')
  ),
  timing: fc.oneof(
    fc.constant('AC'),
    fc.constant('PC'),
    fc.constant('HS')
  ),
  stockLevel: fc.integer({ min: 0, max: 100 }),
});

// Generator for prescription images
const prescriptionImageArbitrary = fc.record({
  format: fc.oneof(fc.constant('jpeg'), fc.constant('png'), fc.constant('pdf')),
  sizeBytes: fc.integer({ min: 1000, max: 10 * 1024 * 1024 }), // 1KB to 10MB
  quality: fc.float({ min: 0, max: 1 }), // OCR confidence
});

// Generator for user language preferences
const languageArbitrary = fc.oneof(
  fc.constant('hi'), // Hindi
  fc.constant('en'), // English
  fc.constant('ta'), // Tamil
  fc.constant('te'), // Telugu
  fc.constant('mr'), // Marathi
  fc.constant('bn'), // Bengali
  fc.constant('gu'), // Gujarati
  fc.constant('kn')  // Kannada
);
```

### Unit Testing

**Framework**: Jest for Lambda functions, React Testing Library for web dashboard

**Coverage Targets**:
- Line coverage: 80%
- Branch coverage: 75%
- Function coverage: 90%

**Test Categories**:

1. **Example Tests**: Specific scenarios with known inputs/outputs
   ```typescript
   it('should parse "BD" as twice daily', () => {
     const result = parseFrequency('BD');
     expect(result).toEqual({ timesPerDay: 2, description: 'Twice daily' });
   });
   ```

2. **Edge Case Tests**: Boundary conditions and special cases
   ```typescript
   it('should handle zero stock level', () => {
     const refillDate = calculateRefillDate(0, 2); // 0 stock, 2 per day
     expect(refillDate).toEqual(new Date()); // Today
   });
   
   it('should handle empty medicine list', () => {
     const interactions = checkDrugInteractions([]);
     expect(interactions).toEqual([]);
   });
   ```

3. **Error Condition Tests**: Verify error handling
   ```typescript
   it('should reject images over 10MB', async () => {
     const largeImage = createMockImage(11 * 1024 * 1024); // 11MB
     await expect(uploadPrescription(largeImage)).rejects.toThrow('IMAGE_TOO_LARGE');
   });
   
   it('should fallback to English on AI service failure', async () => {
     mockClaudeAPI.mockRejectedValue(new Error('Service unavailable'));
     const explanation = await explainMedicine('Aspirin', 'hi');
     expect(explanation.language).toBe('en');
     expect(explanation.fallbackUsed).toBe(true);
   });
   ```

4. **Integration Tests**: Test component interactions
   ```typescript
   it('should complete prescription processing end-to-end', async () => {
     const image = createMockPrescriptionImage();
     const result = await processPrescription(image);
     
     expect(result.medicines).toHaveLength(3);
     expect(result.processingTime).toBeLessThan(10000); // < 10 seconds
     expect(result.ocrConfidence).toBeGreaterThan(0.9);
   });
   ```

### Performance Testing

**Load Testing**: Artillery or k6 for API endpoints

**Scenarios**:
1. Prescription upload: 100 concurrent users, 1000 uploads/minute
2. Reminder delivery: 10,000 reminders/hour
3. Dashboard page load: 500 concurrent users
4. WhatsApp message processing: 1000 messages/minute

**Performance Assertions**:
- p50 latency < 500ms
- p95 latency < 2s
- p99 latency < 5s
- Error rate < 0.1%

**Example Load Test**:

```yaml
# artillery-config.yml
config:
  target: 'https://api.dawaisathi.com'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 300
      arrivalRate: 100
      name: "Sustained load"
    - duration: 60
      arrivalRate: 200
      name: "Spike"
  processor: "./test-helpers.js"

scenarios:
  - name: "Upload and process prescription"
    flow:
      - post:
          url: "/prescriptions"
          headers:
            Authorization: "Bearer {{ $processEnvironment.AUTH_TOKEN }}"
          json:
            image: "{{ generateBase64Image() }}"
      - think: 2
      - get:
          url: "/prescriptions/{{ prescriptionId }}"
          capture:
            - json: "$.medicines"
              as: "medicines"
```

### Test Execution

**CI/CD Pipeline**:
1. **Pre-commit**: Linting, type checking
2. **PR Build**: Unit tests, property tests (100 runs)
3. **Staging Deploy**: Integration tests, smoke tests
4. **Production Deploy**: Canary deployment with monitoring
5. **Post-Deploy**: Performance tests, property tests (1000 runs)

**Test Commands**:
```bash
# Run all tests
npm test

# Run property tests with more iterations
npm test -- --testNamePattern="Property" --numRuns=1000

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test adherence.test.ts

# Run integration tests
npm run test:integration

# Run performance tests
npm run test:performance
```

## Security Architecture

### Authentication and Authorization

**AWS Cognito Configuration**:
- User Pools: Separate pools for patients and healthcare providers
- MFA: Optional SMS-based MFA for sensitive operations
- Password Policy: Minimum 12 characters, complexity requirements
- Session Duration: 1 hour for web, 30 days for mobile (with refresh tokens)
- Social Login: Google, Facebook (optional)

**Authorization Model**:

```typescript
// Role-based access control
enum Role {
  PATIENT = 'patient',
  CAREGIVER = 'caregiver',
  DOCTOR = 'doctor',
  ADMIN = 'admin',
}

// Permission matrix
const permissions = {
  [Role.PATIENT]: [
    'read:own_medicines',
    'write:own_medicines',
    'read:own_adherence',
    'write:own_doses',
    'read:own_documents',
    'write:own_documents',
  ],
  [Role.CAREGIVER]: [
    'read:linked_patient_medicines',
    'read:linked_patient_adherence',
    'write:linked_patient_reminders',
  ],
  [Role.DOCTOR]: [
    'read:patient_history',
    'write:prescriptions',
  ],
  [Role.ADMIN]: [
    'read:all',
    'write:all',
  ],
};

// Authorization middleware
function authorize(requiredPermission: string) {
  return async (req, res, next) => {
    const user = req.user; // From JWT token
    const userPermissions = permissions[user.role];
    
    if (!userPermissions.includes(requiredPermission)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    next();
  };
}
```

### Data Encryption

**At Rest**:
- S3: SSE-KMS with customer-managed key
- RDS: Encryption enabled with KMS key
- DynamoDB: Encryption enabled with AWS-managed key
- ElastiCache: Encryption at rest enabled

**In Transit**:
- API Gateway: TLS 1.3 only
- RDS: SSL/TLS connections enforced
- ElastiCache: TLS enabled
- External APIs: HTTPS only

**KMS Key Management**:
```typescript
// KMS key policy
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:root"
      },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "Allow Lambda to use the key",
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": [
        "kms:Decrypt",
        "kms:DescribeKey"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "s3.ap-south-1.amazonaws.com"
        }
      }
    }
  ]
}
```

**Key Rotation**:
- Automatic rotation: Enabled (yearly)
- Manual rotation: Quarterly for high-security keys
- Zero-downtime rotation: Dual encryption period during rotation

### Network Security

**VPC Configuration**:
- Private subnets for RDS, ElastiCache, Lambda
- Public subnets for NAT Gateway, ALB (if used)
- Security groups: Least privilege, port-specific rules
- NACLs: Additional layer of defense

**WAF Rules**:
```typescript
// AWS WAF configuration
const wafRules = [
  {
    name: 'RateLimitRule',
    priority: 1,
    action: 'BLOCK',
    statement: {
      rateBasedStatement: {
        limit: 2000, // requests per 5 minutes
        aggregateKeyType: 'IP',
      },
    },
  },
  {
    name: 'SQLInjectionRule',
    priority: 2,
    action: 'BLOCK',
    statement: {
      sqliMatchStatement: {
        fieldToMatch: { allQueryArguments: {} },
        textTransformations: [{ priority: 0, type: 'URL_DECODE' }],
      },
    },
  },
  {
    name: 'XSSRule',
    priority: 3,
    action: 'BLOCK',
    statement: {
      xssMatchStatement: {
        fieldToMatch: { body: {} },
        textTransformations: [{ priority: 0, type: 'HTML_ENTITY_DECODE' }],
      },
    },
  },
  {
    name: 'GeoBlockingRule',
    priority: 4,
    action: 'BLOCK',
    statement: {
      notStatement: {
        statement: {
          geoMatchStatement: {
            countryCodes: ['IN'], // Only allow India
          },
        },
      },
    },
  },
];
```

### Secrets Management

**AWS Secrets Manager**:
- Store: API keys (Claude, DrugBank, Twilio, pharmacy APIs)
- Rotation: Automatic rotation every 90 days
- Access: Lambda execution roles with least privilege
- Versioning: Maintain previous versions for rollback

```typescript
// Retrieve secret in Lambda
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

async function getSecret(secretName: string): Promise<string> {
  const client = new SecretsManagerClient({ region: 'ap-south-1' });
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString;
}

// Usage
const claudeApiKey = await getSecret('dawaisathi/claude-api-key');
```

### Compliance

**HIPAA Compliance**:
- BAA (Business Associate Agreement) with AWS
- Audit logging of all PHI access
- Encryption at rest and in transit
- Access controls and authentication
- Regular security assessments

**ABDM Integration**:
- Health ID support
- Consent management
- Data portability (export in ABDM format)
- Interoperability with ABDM ecosystem

**GDPR Compliance** (for future international expansion):
- Right to access: User data export
- Right to erasure: Complete data deletion within 30 days
- Data portability: Machine-readable export
- Consent management: Explicit opt-in for data processing


## Monitoring and Operations

### CloudWatch Metrics

**Custom Metrics**:

```typescript
// Publish custom metrics
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

async function publishMetric(
  metricName: string,
  value: number,
  unit: string,
  dimensions: Record<string, string> = {}
) {
  const client = new CloudWatchClient({ region: 'ap-south-1' });
  
  const command = new PutMetricDataCommand({
    Namespace: 'DawaiSathi',
    MetricData: [
      {
        MetricName: metricName,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
        Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value })),
      },
    ],
  });
  
  await client.send(command);
}

// Example usage
await publishMetric('PrescriptionProcessingTime', 8.5, 'Seconds', { Stage: 'Production' });
await publishMetric('AdherenceScore', 87, 'Percent', { PatientId: 'patient-123' });
await publishMetric('CacheHitRate', 0.85, 'Percent', { CacheType: 'GenericMappings' });
```

**Key Metrics to Track**:

| Metric | Description | Threshold | Alert |
|--------|-------------|-----------|-------|
| PrescriptionProcessingTime | Time to process prescription | > 10s | Warning |
| OCRConfidence | Average OCR confidence score | < 0.85 | Warning |
| AdherenceScore | Average patient adherence | < 70% | Info |
| ReminderDeliveryLatency | Time from scheduled to delivered | > 30s | Critical |
| APILatency | API Gateway response time | p99 > 1s | Warning |
| LambdaErrors | Lambda function errors | > 1% | Critical |
| DatabaseConnections | RDS connection count | > 800 | Warning |
| CacheHitRate | ElastiCache hit rate | < 80% | Warning |
| DrugInteractionChecks | Number of interactions checked | - | Info |
| CounterfeitDetections | Counterfeit medicines detected | - | Info |
| CostPerUser | Daily cost per active user | > ₹5 | Warning |

### CloudWatch Alarms

```typescript
// CDK alarm configuration
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';

const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
  displayName: 'DawaiSathi Alarms',
});

// High error rate alarm
new cloudwatch.Alarm(this, 'HighErrorRate', {
  metric: lambdaFunction.metricErrors({
    statistic: 'Sum',
    period: Duration.minutes(5),
  }),
  threshold: 10,
  evaluationPeriods: 2,
  alarmDescription: 'Lambda function error rate is too high',
  actionsEnabled: true,
  alarmActions: [alarmTopic],
});

// Database connection pool alarm
new cloudwatch.Alarm(this, 'DatabaseConnectionsHigh', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/RDS',
    metricName: 'DatabaseConnections',
    dimensionsMap: { DBInstanceIdentifier: 'dawaisathi-db' },
    statistic: 'Average',
    period: Duration.minutes(5),
  }),
  threshold: 800,
  evaluationPeriods: 2,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  alarmDescription: 'RDS connection pool near capacity',
  actionsEnabled: true,
  alarmActions: [alarmTopic],
});

// Reminder delivery latency alarm
new cloudwatch.Alarm(this, 'ReminderLatencyHigh', {
  metric: new cloudwatch.Metric({
    namespace: 'DawaiSathi',
    metricName: 'ReminderDeliveryLatency',
    statistic: 'Average',
    period: Duration.minutes(5),
  }),
  threshold: 30,
  evaluationPeriods: 3,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  alarmDescription: 'Reminders are being delivered late',
  actionsEnabled: true,
  alarmActions: [alarmTopic],
});
```

### Distributed Tracing with X-Ray

**Lambda Configuration**:
```typescript
// Enable X-Ray tracing
import { LambdaClient } from '@aws-sdk/client-lambda';
import { captureAWSv3Client } from 'aws-xray-sdk-core';

// Wrap AWS SDK clients
const lambda = captureAWSv3Client(new LambdaClient({ region: 'ap-south-1' }));

// Custom subsegments
import AWSXRay from 'aws-xray-sdk-core';

export async function processPrescription(imageKey: string) {
  const segment = AWSXRay.getSegment();
  
  // OCR subsegment
  const ocrSubsegment = segment.addNewSubsegment('OCR Processing');
  try {
    const ocrResult = await textract.analyzeDocument({ /* ... */ });
    ocrSubsegment.addAnnotation('confidence', ocrResult.confidence);
    ocrSubsegment.close();
  } catch (error) {
    ocrSubsegment.addError(error);
    ocrSubsegment.close();
    throw error;
  }
  
  // Entity extraction subsegment
  const entitySubsegment = segment.addNewSubsegment('Entity Extraction');
  try {
    const entities = await comprehendMedical.detectEntitiesV2({ /* ... */ });
    entitySubsegment.addMetadata('entityCount', entities.length);
    entitySubsegment.close();
  } catch (error) {
    entitySubsegment.addError(error);
    entitySubsegment.close();
    throw error;
  }
}
```

### Logging Strategy

**Structured Logging**:
```typescript
// Logger utility
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  serviceName: 'dawaisathi',
  logLevel: process.env.LOG_LEVEL || 'INFO',
});

// Usage
logger.info('Processing prescription', {
  userId: 'user-123',
  imageKey: 's3://bucket/key',
  imageSize: 2048576,
});

logger.error('OCR failed', {
  userId: 'user-123',
  error: error.message,
  stack: error.stack,
  imageKey: 's3://bucket/key',
});

// Add persistent keys
logger.appendKeys({
  environment: process.env.STAGE,
  version: process.env.APP_VERSION,
});
```

**Log Retention**:
- Operational logs: 90 days
- Audit logs (PHI access): 2 years
- Error logs: 1 year
- Debug logs: 7 days

**Log Insights Queries**:

```sql
-- Find slow prescription processing
fields @timestamp, userId, processingTime
| filter @message like /Processing prescription/
| filter processingTime > 10
| sort processingTime desc
| limit 20

-- Track adherence trends
fields @timestamp, patientId, adherenceScore
| filter @message like /Adherence calculated/
| stats avg(adherenceScore) by bin(5m)

-- Identify error patterns
fields @timestamp, @message, error
| filter @type = "ERROR"
| stats count() by error
| sort count desc
```

### Dashboards

**CloudWatch Dashboard**:

```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

const dashboard = new cloudwatch.Dashboard(this, 'DawaiSathiDashboard', {
  dashboardName: 'DawaiSathi-Production',
});

// Add widgets
dashboard.addWidgets(
  // API metrics
  new cloudwatch.GraphWidget({
    title: 'API Performance',
    left: [
      apiGateway.metricCount({ statistic: 'Sum' }),
      apiGateway.metric4XXError({ statistic: 'Sum' }),
      apiGateway.metric5XXError({ statistic: 'Sum' }),
    ],
    right: [
      apiGateway.metricLatency({ statistic: 'Average' }),
    ],
  }),
  
  // Lambda metrics
  new cloudwatch.GraphWidget({
    title: 'Lambda Execution',
    left: [
      prescriptionProcessor.metricInvocations({ statistic: 'Sum' }),
      prescriptionProcessor.metricErrors({ statistic: 'Sum' }),
    ],
    right: [
      prescriptionProcessor.metricDuration({ statistic: 'Average' }),
    ],
  }),
  
  // Database metrics
  new cloudwatch.GraphWidget({
    title: 'Database Performance',
    left: [
      new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'DatabaseConnections',
        dimensionsMap: { DBInstanceIdentifier: 'dawaisathi-db' },
      }),
    ],
    right: [
      new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'ReadLatency',
        dimensionsMap: { DBInstanceIdentifier: 'dawaisathi-db' },
        statistic: 'Average',
      }),
    ],
  }),
  
  // Business metrics
  new cloudwatch.SingleValueWidget({
    title: 'Active Users (24h)',
    metrics: [
      new cloudwatch.Metric({
        namespace: 'DawaiSathi',
        metricName: 'ActiveUsers',
        statistic: 'Sum',
        period: Duration.days(1),
      }),
    ],
  }),
  
  new cloudwatch.SingleValueWidget({
    title: 'Average Adherence Score',
    metrics: [
      new cloudwatch.Metric({
        namespace: 'DawaiSathi',
        metricName: 'AdherenceScore',
        statistic: 'Average',
        period: Duration.days(1),
      }),
    ],
  })
);
```

### Incident Response

**Runbooks**:

1. **High Error Rate**
   - Check CloudWatch Logs for error patterns
   - Verify external API availability (Claude, DrugBank, Twilio)
   - Check RDS connection pool status
   - Review recent deployments
   - Rollback if necessary

2. **Reminder Delivery Failures**
   - Check EventBridge rule status
   - Verify Lambda ReminderSender logs
   - Check Twilio API status
   - Inspect SQS dead letter queue
   - Manually trigger failed reminders

3. **Database Connection Issues**
   - Check RDS CPU and memory utilization
   - Review slow query logs
   - Verify connection pool configuration
   - Scale RDS instance if needed
   - Add read replicas for read-heavy operations

4. **OCR Processing Failures**
   - Check Textract service status
   - Review image quality metrics
   - Verify S3 bucket permissions
   - Check Lambda timeout settings
   - Increase Lambda memory if needed

**On-Call Rotation**:
- Primary: 24/7 on-call engineer
- Secondary: Backup engineer
- Escalation: Engineering manager
- PagerDuty integration for critical alerts

## Deployment Strategy

### Infrastructure as Code

**AWS CDK (TypeScript)**:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class DawaiSathiStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // S3 bucket for documents
    const documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      bucketName: `dawaisathi-documents-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      versioned: true,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
          expiration: cdk.Duration.days(2555), // 7 years
        },
      ],
    });
    
    // RDS PostgreSQL
    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_3,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MEDIUM
      ),
      vpc,
      multiAz: true,
      allocatedStorage: 100,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
    });
    
    // Lambda function
    const prescriptionProcessor = new lambda.Function(this, 'PrescriptionProcessor', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/prescription-processor'),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      environment: {
        BUCKET_NAME: documentBucket.bucketName,
        DB_HOST: database.dbInstanceEndpointAddress,
        DB_NAME: 'dawaisathi',
      },
      tracing: lambda.Tracing.ACTIVE,
    });
    
    // API Gateway
    const api = new apigateway.RestApi(this, 'API', {
      restApiName: 'DawaiSathi API',
      deployOptions: {
        stageName: 'prod',
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
    });
    
    const prescriptions = api.root.addResource('prescriptions');
    prescriptions.addMethod(
      'POST',
      new apigateway.LambdaIntegration(prescriptionProcessor)
    );
  }
}
```

### CI/CD Pipeline

**GitHub Actions Workflow**:

```yaml
name: Deploy DawaiSathi

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run type check
        run: npm run type-check
      
      - name: Run unit tests
        run: npm test -- --coverage
      
      - name: Run property tests
        run: npm test -- --testNamePattern="Property" --numRuns=100
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
  
  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-south-1
      
      - name: Deploy to staging
        run: |
          npm ci
          npm run cdk deploy -- --all --require-approval never
        env:
          STAGE: staging
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          API_URL: ${{ steps.deploy.outputs.api_url }}
  
  deploy-production:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-south-1
      
      - name: Deploy to production (canary)
        run: |
          npm ci
          npm run cdk deploy -- --all --require-approval never
        env:
          STAGE: production
          CANARY_PERCENTAGE: 10
      
      - name: Monitor canary
        run: npm run monitor-canary
        timeout-minutes: 30
      
      - name: Promote canary
        if: success()
        run: npm run promote-canary
      
      - name: Rollback canary
        if: failure()
        run: npm run rollback-canary
```

### Deployment Environments

| Environment | Purpose | AWS Account | Auto-Deploy | Approval Required |
|-------------|---------|-------------|-------------|-------------------|
| Development | Local testing | Dev | No | No |
| Staging | Integration testing | Dev | Yes (on staging branch) | No |
| Production | Live users | Prod | Yes (on main branch) | Yes (canary) |

### Canary Deployment

```typescript
// Lambda alias with traffic shifting
const alias = new lambda.Alias(this, 'ProdAlias', {
  aliasName: 'prod',
  version: newVersion,
  additionalVersions: [
    {
      version: currentVersion,
      weight: 0.9, // 90% traffic to current version
    },
  ],
});

// Gradually shift traffic over 30 minutes
new codedeploy.LambdaDeploymentGroup(this, 'DeploymentGroup', {
  alias,
  deploymentConfig: codedeploy.LambdaDeploymentConfig.CANARY_10PERCENT_30MINUTES,
  alarms: [errorRateAlarm, latencyAlarm],
  autoRollback: {
    failedDeployment: true,
    deploymentInAlarm: true,
  },
});
```

### Database Migrations

**Flyway for PostgreSQL**:

```sql
-- V1__initial_schema.sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- V2__add_language_preference.sql
ALTER TABLE users ADD COLUMN preferred_language VARCHAR(10) DEFAULT 'en';

-- V3__create_medicines_table.sql
CREATE TABLE medicines (
    medicine_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Migration Script**:
```bash
#!/bin/bash
# Run migrations before deployment
flyway -url=jdbc:postgresql://${DB_HOST}:5432/${DB_NAME} \
       -user=${DB_USER} \
       -password=${DB_PASSWORD} \
       -locations=filesystem:./migrations \
       migrate
```

## Cost Analysis

### AWS Free Tier (Hackathon Development)

**Services within Free Tier**:
- Lambda: 1M requests/month, 400,000 GB-seconds compute
- API Gateway: 1M API calls/month (12 months)
- S3: 5 GB storage, 20,000 GET requests, 2,000 PUT requests
- RDS: 750 hours/month db.t3.micro (12 months)
- DynamoDB: 25 GB storage, 25 read/write capacity units
- CloudWatch: 10 custom metrics, 10 alarms
- SNS: 1,000 email notifications, 100 SMS
- SES: 62,000 emails/month (from EC2)

**Estimated Free Tier Coverage**: ~100 users for 12 months

### Cost at 1,000 Users

**Assumptions**:
- 10 prescriptions/user/month
- 30 reminders/user/month
- 5 medicine explanations/user/month
- 100 adherence checks/user/month

**Monthly Costs**:

| Service | Usage | Unit Cost | Monthly Cost |
|---------|-------|-----------|--------------|
| Lambda | 1.5M invocations, 300K GB-sec | $0.20/1M req, $0.0000166667/GB-sec | $5.30 |
| API Gateway | 500K requests | $3.50/1M requests | $1.75 |
| RDS (db.t3.medium) | 730 hours | $0.068/hour | $49.64 |
| S3 Storage | 50 GB | $0.023/GB | $1.15 |
| S3 Requests | 50K PUT, 200K GET | $0.005/1K PUT, $0.0004/1K GET | $0.33 |
| DynamoDB | 10 GB, 100K reads, 50K writes | $0.25/GB, $0.25/1M reads, $1.25/1M writes | $2.63 |
| ElastiCache (t3.medium) | 730 hours | $0.068/hour | $49.64 |
| Textract | 10K pages | $1.50/1K pages | $15.00 |
| Comprehend Medical | 10K units | $0.01/unit | $100.00 |
| Rekognition | 5K images | $0.001/image | $5.00 |
| SNS (SMS) | 30K messages | $0.00645/SMS (India) | $193.50 |
| SES (Email) | 10K emails | $0.10/1K emails | $1.00 |
| EventBridge | 1M events | $1.00/1M events | $1.00 |
| CloudWatch Logs | 10 GB ingestion, 10 GB storage | $0.50/GB ingestion, $0.03/GB storage | $5.30 |
| Data Transfer | 100 GB out | $0.09/GB (first 10 TB) | $9.00 |
| **Total** | | | **$440.24** |

**Cost per User**: ₹440.24 / 1,000 = ₹0.44/user/month ✅ (Well under ₹5 target)

### Cost at 100,000 Users

**Assumptions**:
- Same usage patterns per user
- Scaled infrastructure (larger RDS, more cache nodes)

**Monthly Costs**:

| Service | Usage | Unit Cost | Monthly Cost |
|---------|-------|-----------|--------------|
| Lambda | 150M invocations, 30M GB-sec | $0.20/1M req, $0.0000166667/GB-sec | $530.00 |
| API Gateway | 50M requests | $3.50/1M requests | $175.00 |
| RDS (db.r5.large) Multi-AZ | 730 hours × 2 | $0.29/hour | $423.40 |
| RDS Read Replicas (2×) | 730 hours × 2 | $0.145/hour | $211.70 |
| S3 Storage | 5 TB | $0.023/GB | $117.76 |
| S3 Requests | 5M PUT, 20M GET | $0.005/1K PUT, $0.0004/1K GET | $33.00 |
| DynamoDB | 1 TB, 10M reads, 5M writes | $0.25/GB, $0.25/1M reads, $1.25/1M writes | $258.75 |
| ElastiCache (r5.large) 2 shards | 730 hours × 4 nodes | $0.188/hour | $549.44 |
| Textract | 1M pages | $1.50/1K pages | $1,500.00 |
| Comprehend Medical | 1M units | $0.01/unit | $10,000.00 |
| Rekognition | 500K images | $0.001/image | $500.00 |
| SNS (SMS) | 3M messages | $0.00645/SMS | $19,350.00 |
| SES (Email) | 1M emails | $0.10/1K emails | $100.00 |
| EventBridge | 100M events | $1.00/1M events | $100.00 |
| CloudWatch Logs | 500 GB ingestion, 500 GB storage | $0.50/GB ingestion, $0.03/GB storage | $265.00 |
| Data Transfer | 10 TB out | $0.09/GB (first 10 TB) | $921.60 |
| **Total** | | | **$35,035.65** |

**Cost per User**: ₹35,035.65 / 100,000 = ₹0.35/user/month ✅ (Well under ₹5 target)

### Cost Optimization Strategies

1. **SMS Cost Reduction** (Largest cost component)
   - Use WhatsApp as primary channel (free for business-initiated messages)
   - SMS only as fallback (reduces SMS usage by 80%)
   - Optimized cost: $3,870 instead of $19,350 at 100K users

2. **AI Service Cost Reduction**
   - Aggressive caching (30-day TTL for explanations)
   - Batch processing for Textract (reduce per-page cost)
   - Use Claude Haiku instead of Sonnet (5× cheaper)
   - Cache hit rate 85% → Reduce Comprehend Medical cost by 85%

3. **Database Optimization**
   - Use read replicas for read-heavy operations
   - Implement connection pooling (RDS Proxy)
   - Archive old data to S3 (reduce RDS storage)
   - Use DynamoDB for session data (cheaper than RDS)

4. **Compute Optimization**
   - Right-size Lambda memory (reduce over-provisioning)
   - Use Lambda reserved concurrency for predictable workloads
   - Implement API response caching (reduce Lambda invocations)

5. **Storage Optimization**
   - S3 Intelligent-Tiering (automatic cost optimization)
   - Lifecycle policies (move to Glacier after 90 days)
   - Compress images before storage
   - Delete temporary files after processing

**Optimized Cost at 100K Users**: ~₹15,000/month = ₹0.15/user/month ✅

### Revenue Model (Future)

**Freemium Model**:
- Free Tier: Basic medication reminders, adherence tracking (target: ₹0.15/user/month cost)
- Premium Tier: ₹99/month - Teleconsultation, priority support, family dashboard
- Enterprise Tier: ₹999/month - Hospital/clinic integration, bulk user management

**Break-even Analysis**:
- At 100K users with 5% premium conversion: 5,000 × ₹99 = ₹4,95,000/month revenue
- Operating cost: ₹15,000/month
- Gross margin: 97% ✅

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Status:** Draft - Pending Review  
**Target Platform:** AWS Cloud (ap-south-1 Mumbai region)  
**Hackathon:** AWS AI for Bharat  
**Architecture:** Serverless, Event-Driven, Multi-Channel  
**Compliance:** HIPAA-ready, ABDM-compatible, Data Residency (India)
