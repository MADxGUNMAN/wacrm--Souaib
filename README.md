# Replai - AI-Powered WhatsApp CRM

![Replai](/public/Replai-logo.png)

A self-hostable CRM template for WhatsApp built on **Next.js** and **Supabase** — featuring a shared inbox, contact management, sales pipelines, broadcast campaigns, AI knowledge base, and no-code visual automations.

## 🚀 Features

* **Shared Team Inbox:** Manage WhatsApp conversations collaboratively with your team. Assign chats, leave internal notes, and never miss a message.
* **Smart Contact Management:** Automatic contact profile creation, deduplication, custom tags, and filtering.
* **Visual No-Code Automations (Flows):** Build powerful chat flows, interactive messages, and automated reply sequences using a drag-and-drop builder (powered by React Flow).
* **Broadcast Campaigns:** Send bulk WhatsApp messages, manage recipient lists, and track campaign performance (delivered, read, replied).
* **AI Knowledge Base & Auto-Replies:** Train your CRM on your company's documents and enable AI to draft or automatically send replies to customer queries.
* **Sales Pipelines:** Visualize leads and deals in a drag-and-drop Kanban board (powered by DnD Kit).
* **Dynamic Landing Page & Super Admin CMS:** Manage your SaaS website's navigation, SEO, theming, and footer directly from the built-in Super Admin panel.
* **Meta Business Integration:** Native integration with WhatsApp Cloud API (Webhooks, Templates, and Cloud API messages).

## 🛠 Tech Stack

* **Framework:** Next.js 15 (App Router)
* **Database & Auth:** Supabase (PostgreSQL, Row Level Security, Realtime, Storage)
* **Styling:** Tailwind CSS, Base UI, Lucide Icons
* **Drag & Drop:** `@dnd-kit` for Kanban boards, `@xyflow/react` for the Automation Flow builder
* **Forms & State:** React Hook Form, Zod validation
* **Language:** TypeScript

## 📦 Getting Started

### 1. Prerequisites
- Node.js >= 20.0.0
- A Supabase project (Local or Cloud)
- A Meta Developer Account with WhatsApp Cloud API configured

### 2. Clone the Repository
```bash
git clone https://github.com/JunkiesCoder/replai.git
cd replai
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Environment Configuration
Copy the `.env.example` file to `.env.local` and fill in the required values:

```bash
cp .env.example .env.local
```

**Key variables needed:**
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY` (Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `META_APP_SECRET` (From your Meta App Dashboard)

### 5. Database Setup
Ensure you run all the provided Supabase migrations to set up the necessary tables, triggers, and Row Level Security (RLS) policies.

```bash
npx supabase db push
```

### 6. Run the Development Server
```bash
npm run dev
```

Your app should now be running on [http://localhost:3000](http://localhost:3000).

## 🔗 WhatsApp Webhook Setup
To receive incoming WhatsApp messages:
1. Expose your local server using a tool like `ngrok`: 
   ```bash
   ngrok http 3000
   ```
2. Navigate to your Meta App Dashboard -> WhatsApp -> Configuration.
3. Set the Webhook URL to `https://<your-ngrok-url>/api/webhooks/whatsapp`.
4. Enter your custom verify token (ensure it matches your backend configuration).
5. Subscribe to the `messages` field.

## 🤝 Contributing
Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](https://github.com/JunkiesCoder/replai/issues).

## 📝 License
This project is licensed under the MIT License - see the LICENSE file for details.

---
*Built with ❤️ by Souaib Ansari*
