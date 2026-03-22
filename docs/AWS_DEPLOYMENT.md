# AWS Deployment Guide — ARIA Voice Scheduler

## Architecture

```
Internet
    │
    ▼
[CloudFront CDN]
    │
    ├── /api/* ──────────────────────► [EC2 / Elastic Beanstalk]
    │                                     Express Backend (port 4000)
    │                                            │
    │                                     [RDS MySQL]
    │                                     (aria_scheduler db)
    │
    └── /* ─────────────────────────► [Vercel / S3 + CloudFront]
                                         Next.js Frontend
```

---

## Option A: Vercel (Frontend) + EC2 (Backend) + RDS (Database)
### Recommended for this project

---

## Step 1: Set Up RDS MySQL

1. Go to AWS Console → RDS → Create Database
2. Engine: **MySQL 8.0**
3. Template: **Free tier**
4. DB instance identifier: `aria-scheduler`
5. Master username: `admin`
6. Master password: (save this)
7. Public access: **Yes** (for initial setup, restrict later)
8. VPC security group: allow port 3306 from your EC2 IP

After creation, note the **Endpoint URL**.

Run the schema:
```bash
mysql -h your-rds-endpoint.amazonaws.com -u admin -p aria_scheduler < database/schema.sql
```

---

## Step 2: Deploy Backend to EC2

### Launch EC2 Instance
1. AWS Console → EC2 → Launch Instance
2. AMI: **Ubuntu 22.04 LTS**
3. Instance type: **t2.micro** (free tier)
4. Security group: allow ports **22** (SSH), **4000** (API)
5. Create a key pair → download `.pem` file

### SSH and Setup
```bash
# Connect
ssh -i your-key.pem ubuntu@your-ec2-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Clone your repo
git clone https://github.com/YOUR_USERNAME/voice-scheduler.git
cd voice-scheduler/backend

# Install dependencies
npm install

# Create .env
nano .env
# Paste your environment variables (see .env.example)
```

### Environment Variables on EC2
```env
PORT=4000
NODE_ENV=production
DB_HOST=your-rds-endpoint.amazonaws.com
DB_PORT=3306
DB_NAME=aria_scheduler
DB_USER=admin
DB_PASSWORD=your_rds_password
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=https://your-vercel-url.vercel.app/api/calendar/callback
FRONTEND_URL=https://your-vercel-url.vercel.app
```

### Run Migrations and Start
```bash
npm run migrate
pm2 start src/server.js --name "aria-backend"
pm2 save
pm2 startup  # Auto-restart on reboot
```

### Verify
```bash
curl http://your-ec2-ip:4000/api/health
# Should return: {"status":"ok","db":"ok",...}
```

---

## Step 3: Deploy Frontend to Vercel

1. Push code to GitHub
2. Go to https://vercel.com → Import repo
3. Add environment variables:
```
GROQ_API_KEY=gsk_...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_URL=https://your-vercel-url.vercel.app
BACKEND_URL=http://your-ec2-ip:4000/api
NEXT_PUBLIC_API_URL=http://your-ec2-ip:4000/api
```
4. Deploy

---

## Option B: Elastic Beanstalk (easier scaling)

```bash
# Install EB CLI
pip install awsebcli

cd backend
eb init aria-scheduler --platform node.js --region us-east-1
eb create production
eb setenv PORT=4000 DB_HOST=... DB_PASSWORD=... (etc)
eb deploy
```

---

## Option C: Lambda (serverless backend)

For the Next.js frontend, Vercel handles this automatically.
For the backend, you can deploy with:

```bash
npm install -g serverless
serverless deploy
```

Add `serverless.yml` to backend:
```yaml
service: aria-backend
provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
functions:
  api:
    handler: src/server.handler
    events:
      - http: ANY /
      - http: ANY /{proxy+}
```

---

## Production Checklist

- [ ] RDS in private subnet (not publicly accessible)
- [ ] EC2 behind Application Load Balancer
- [ ] HTTPS via ACM certificate on ALB
- [ ] Environment variables never committed to git
- [ ] PM2 running with `pm2 startup`
- [ ] CloudWatch logs enabled
- [ ] Security groups restrict traffic correctly
- [ ] CORS set to production frontend URL only

---

## Cost Estimate (AWS Free Tier)

| Service | Tier | Monthly Cost |
|---------|------|-------------|
| EC2 t2.micro | Free tier | $0 |
| RDS db.t2.micro | Free tier | $0 |
| Vercel Frontend | Hobby | $0 |
| Route 53 domain | Optional | ~$12/yr |
| **Total** | | **~$0** |
