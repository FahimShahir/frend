# 🤖 FREND — Full Laravel 12 & MySQL WhatsApp AI System

> **সম্পূর্ণ প্রজেক্টটি এখন ১০০% ফুল লারাভেল (Full Laravel 12 Application) ও MySQL ভিত্তিক।**  
> cPanel শেয়ার্ড হোস্টিং (Shared Hosting)-এ Node.js সাপোর্ট ছাড়াই সম্পূর্ণ সিস্টেমটি চালানো যাবে।

---

## 📁 প্রজেক্ট আর্কিটেকচার (Project Architecture)

```
frend/
├── app/                      # Controllers, Eloquent Models, Services (100% PHP)
│   ├── Http/Controllers/     # Admin, Notes, Reminders, Migrations, Webhook Controllers
│   ├── Models/               # Note, Reminder, BotUser, Plan, Gamification, Setting
│   └── Services/             # GeminiAiService, ReminderDispatchService, FrendWhatsAppService
├── bootstrap/                # Laravel Bootstrap & Providers
├── config/                   # Laravel কনফিগারেশন
├── database/                 # মাইগ্রেশন ও সম্পূর্ণ MySQL ডাটাবেস
│   ├── frend_complete_mysql.sql # 1-Click Import Ready MySQL Dump (14 Tables)
│   └── migrations/           # 2026_10_13_000001_create_frend_system_tables.php
├── public/                   # Web Root (index.php)
├── resources/views/admin/    # Blade Views (WhatsApp Control, Notes, Reminders, Migrations)
├── routes/web.php            # ২৬টি ফুল রাউট (Dashboard, API, Webhook, Cron)
├── storage/                  # Logs, Sessions, Cache
├── whatsapp_bot_runner/      # WhatsApp Web QR Scanner & Bridge (লোকাল পিসিতে চালানোর জন্য)
├── .env                      # ডাটাবেস ও সিস্টেম কনফিগারেশন
├── artisan                   # Laravel CLI
└── composer.json             # PHP Dependencies
```

---

## 🐬 লারাভেলে ডেটাবেস কানেক্ট করবেন যেভাবে (Database Connection Guide)

### ১. লোকাল পিসিতে (XAMPP / WAMP):
1. **XAMPP Control Panel** ওপেন করুন এবং **MySQL** এর পাশে `Start` বাটনে ক্লিক করুন।
2. ব্রাউজারে `http://localhost/phpmyadmin` ওপেন করে `frend_db` নামে একটি নতুন ডেটাবেস তৈরি করুন।
3. প্রজেক্টের রুট ডিরেক্টরির `.env` ফাইলে নিচের সেটিংস দিন:
```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=frend_db
DB_USERNAME=root
DB_PASSWORD=
```
*(XAMPP-তে সাধারণত পাসওয়ার্ড খালি থাকে)*

---

### ২. cPanel শেয়ার্ড হোস্টিংয়ে (cPanel Shared Hosting):
1. আপনার **cPanel** লগইন করে **MySQL Database Wizard**-এ যান।
2. নতুন ডাটাবেস তৈরি করুন (যেমন: `username_frend_db`)।
3. নতুন ডাটাবেস ইউজার ও স্ট্রং পাসওয়ার্ড তৈরি করুন (যেমন: `username_frend_user`)।
4. ইউজারকে সব পারমিশন দিন (**ALL PRIVILEGES** টিক মার্ক দিন)।
5. প্রজেক্টের `.env` ফাইলে তথ্যগুলো বসান:
```env
DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=username_frend_db
DB_USERNAME=username_frend_user
DB_PASSWORD=আপনার_পাসওয়ার্ড
```

---

## 🚀 ডেটাবেস টেবিল ইমপোর্ট করবেন যেভাবে (২টি সহজ উপায়)

### উপায় ১: ব্রাউজার থেকে ১-ক্লিকে (SSH / Terminal ছাড়াই):
1. আপনার ব্রাউজারে যান: `http://localhost:8000/admin/migrations` (বা হোস্টিংয়ে `https://yourdomain.com/admin/migrations`)।
2. **"Run Migrations (php artisan migrate)"** বাটনে ক্লিক করলেই সব টেবিল স্বয়ংক্রিয়ভাবে তৈরি হয়ে যাবে!
3. অথবা **"Import Database Dump (frend_complete_mysql.sql)"** বাটনে ক্লিক করলেই অ্যাডমিন ইউজার, সাবস্ক্রিপশন প্ল্যান ও গ্যামিফিকেশন টেবিলসহ সবকিছু রেডি হয়ে যাবে।

### উপায় ২: phpMyAdmin দিয়ে সরাসরি SQL ইমপোর্ট:
- phpMyAdmin-এ গিয়ে আপনার ডাটাবেস সিলেক্ট করে `database/frend_complete_mysql.sql` ফাইলটি **Import** করে নিন।

---

## 🌐 লোকাল পিসিতে Laravel রান করার নিয়ম:

```bash
# ১. রুট ফোল্ডারে টার্মিনাল ওপেন করুন
cd f:\frend

# ২. লারাভেল সার্ভার স্টার্ট করুন
php artisan serve
```
এখন ব্রাউজারে `http://127.0.0.1:8000/admin/whatsapp` ভিজিট করুন!

---

## 📱 WhatsApp বট কানেকশন (cPanel এ Node.js না থাকলে):

যেহেতু cPanel শেয়ার্ড হোস্টিংয়ে কোনো Node.js নেই এবং Meta Paid API-তে ক্রেডিট কার্ড চার্জ করে:
1. আপনার হোস্টিংয়ে সম্পূর্ণ সিস্টেম চলবে পিওর পিএইচপি ও লারাভেলে (MySQL ডাটাবেস, AI লজিক, রিমাইন্ডার, নোটস, ড্যাশবোর্ড)।
2. আপনার লোকাল পিসিতে শুধু WhatsApp Web কিউআর কোড স্ক্যান করে কানেক্ট রাখার জন্য:
```bash
cd whatsapp_bot_runner
npm start
```
3. এই বটটি হোয়াটসঅ্যাপের ইনকামিং মেসেজ লারাভেলের `/api/whatsapp/webhook` এ পাঠাবে এবং লারাভেল উত্তর দিয়ে দেবে!

---

## ⏰ cPanel Cron Job সেটআপ (টার্মিনাল ছাড়া নির্দিষ্ট সময়ে রিমাইন্ডার পাঠানোর জন্য):
cPanel-এর **Cron Jobs** সেকশনে গিয়ে প্রতি ১ মিনিটে এই কমান্ডটি দিন:
```bash
* * * * * curl -s "https://yourdomain.com/cron/reminders/process" >/dev/null 2>&1
```
বা টার্মিনাল সাপোর্ট থাকলে:
```bash
* * * * * cd /home/username/public_html && php artisan frend:dispatch-reminders >> /dev/null 2>&1
```

🎉 **সম্পূর্ণ প্রজেক্টটি এখন ফুল লারাভেল এবং যেকোনো শেয়ার্ড হোস্টিং বা লোকাল পিসিতে ব্যবহারের জন্য প্রস্তুত!**
