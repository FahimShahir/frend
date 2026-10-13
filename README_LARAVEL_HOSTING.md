# 🚀 FREND WhatsApp Assistant — Complete Laravel & MySQL cPanel Integration Guide

এই গাইডে বিস্তারিত বলা হয়েছে কীভাবে আপনি **cPanel Shared Hosting-এ (যেখানে Node.js নেই)** সম্পূর্ণ সিস্টেমটি **Laravel ও MySQL** দিয়ে পরিচালনা করবেন।

---

## 🏗️ আর্কিটেকচার ওভারভিউ (Node.js ছাড়া cPanel-এ কীভাবে কাজ করবে?)

| কম্পোনেন্ট | হোস্টিং মাধ্যম | ভূমিকা |
| :--- | :--- | :--- |
| **Laravel Web App** | cPanel Shared Hosting (PHP 8.1+) | ড্যাশবোর্ড, ইউজার, নোটস, রিমাইন্ডার, Gemini AI প্রসেসিং ও কন্ট্রোল |
| **MySQL Database** | cPanel phpMyAdmin | স্থায়ী ডেটা সংরক্ষণ (UTF8mb4 বাংলা ও ইমোজি সম্পূর্ণ সাপোর্টেড) |
| **WhatsApp Engine** | Railway.app (ফ্রি ক্লাউড) | WhatsApp Web কানেকশন, সেশন ও কিউআর জেনারেশন |
| **স্মার্ট ক্রনজব** | cPanel Cron Jobs | নির্দিষ্ট সময়ে স্বয়ংক্রিয়ভাবে WhatsApp-এ রিমাইন্ডার পাঠানো |

> **ম্যাজিক:** আপনার cPanel-এ ১ ফোঁটাও Node.js-এর প্রয়োজন নেই! Laravel সরাসরি HTTP API দিয়ে Railway-এর সাথে কথা বলবে। আপনি Laravel ড্যাশবোর্ডেই লাইভ কিউআর কোড স্ক্যান করতে পারবেন এবং মেসেজ পাঠাতে পারবেন।

---

## 📁 Laravel প্রজেক্টে ফাইলগুলো রাখার সঠিক ম্যাপ

আমরা `frend/laravel/` ফোল্ডারে আপনার জন্য সব ফাইল প্রস্তুত করে রেখেছি। নিচের ডিরেক্টরি অনুযায়ী ফাইলগুলো আপনার Laravel প্রজেক্টে পেস্ট করুন:

```
আপনার Laravel প্রজেক্ট/
├── app/
│   ├── Models/
│   │   ├── Note.php                                    ← frend/laravel/app/Models/Note.php
│   │   ├── Reminder.php                                ← frend/laravel/app/Models/Reminder.php
│   │   ├── BotUser.php                                 ← frend/laravel/app/Models/BotUser.php
│   │   ├── Plan.php                                    ← frend/laravel/app/Models/Plan.php
│   │   ├── Gamification.php                            ← frend/laravel/app/Models/Gamification.php
│   │   └── Setting.php                                 ← frend/laravel/app/Models/Setting.php
│   ├── Services/
│   │   ├── FrendWhatsAppService.php                    ← frend/laravel/FrendWhatsAppService.php
│   │   ├── GeminiAiService.php                         ← frend/laravel/app/Services/GeminiAiService.php
│   │   └── ReminderDispatchService.php                 ← frend/laravel/app/Services/ReminderDispatchService.php
│   └── Http/Controllers/
│       ├── FrendAdminController.php                    ← frend/laravel/FrendAdminController.php
│       ├── FrendNotesController.php                    ← frend/laravel/app/Http/Controllers/FrendNotesController.php
│       ├── FrendRemindersController.php                ← frend/laravel/app/Http/Controllers/FrendRemindersController.php
│       ├── SystemMigrationController.php               ← frend/laravel/app/Http/Controllers/SystemMigrationController.php
│       └── WhatsAppWebhookController.php               ← frend/laravel/app/Http/Controllers/WhatsAppWebhookController.php
├── database/
│   ├── frend_complete_mysql.sql                        ← frend/laravel/database/frend_complete_mysql.sql (SQL Dump)
│   └── migrations/
│       └── 2026_10_13_000001_create_frend_system_tables.php ← frend/laravel/database/migrations/...
├── resources/views/admin/
│   ├── layout.blade.php                                ← frend/laravel/resources/views/admin/layout.blade.php
│   ├── whatsapp.blade.php                              ← frend/laravel/resources/views/admin/whatsapp.blade.php
│   ├── notes.blade.php                                 ← frend/laravel/resources/views/admin/notes.blade.php
│   ├── reminders.blade.php                             ← frend/laravel/resources/views/admin/reminders.blade.php
│   └── migrations.blade.php                            ← frend/laravel/resources/views/admin/migrations.blade.php
└── routes/
    ├── web.php (রুটগুলো যোগ করুন)                         ← frend/laravel/routes/web_routes_snippet.php
    └── api.php (API রুট যোগ করুন)                         ← frend/laravel/routes/api_routes_snippet.php
```

---

## 🗄️ ডেটাবেস সেটআপের ২টি সহজ উপায় (যেকোনো ১টি বেছে নিন)

### পদ্ধতি ১: phpMyAdmin দিয়ে ১-ক্লিকে ইমপোর্ট (সবচেয়ে সহজ)
1. cPanel-এ লগইন করে **MySQL Databases**-এ গিয়ে একটি ডেটাবেস এবং ইউজার তৈরি করে প্রিভিলেজ দিন।
2. **phpMyAdmin** খুলুন এবং আপনার ডেটাবেসটি সিলেক্ট করুন।
3. উপরে **Import** ট্যাবে ক্লিক করুন।
4. `frend/laravel/database/frend_complete_mysql.sql` ফাইলটি সিলেক্ট করে **Import / Go** বাটনে ক্লিক করুন।
5. ব্যস! সকল টেবিল, ডিফল্ট অ্যাডমিন (`admin` / `123`), সাবস্ক্রিপশন প্ল্যান ও সেটিংস তৈরি হয়ে যাবে।

---

### পদ্ধতি ২: ব্রাউজার থেকে মাইগ্রেশন রান করা (SSH টার্মিনাল ছাড়া!)
যেহেতু cPanel শেয়ার্ড হোস্টিংয়ে SSH টার্মিনাল বা `php artisan` কমান্ড দেওয়ার সুযোগ থাকে না, তাই আমরা একটি **ওয়েব মাইগ্রেশন সেটিংস পেজ** তৈরি করে দিয়েছি:
1. আপনার ব্রাউজারে যান:  
   `https://yourdomain.com/admin/migrations`
2. স্ক্রিনে **"🚀 মাইগ্রেশন রান করুন (php artisan migrate)"** বাটনে ক্লিক করুন।
3. ব্রাউজারের কনসোলে সরাসরি লাইভ মাইগ্রেশন আউটপুট দেখতে পাবেন এবং ১ ক্লিকেই টেবিল তৈরি হয়ে যাবে!
4. প্রয়োজনে আপনি **"📥 সরাসরি SQL ডাম্প ইমপোর্ট করুন"** বাটনে ক্লিক করেও ডেটাবেস সেটআপ করতে পারবেন।

---

## ⚙️ Laravel `.env` কনফিগারেশন

আপনার Laravel প্রজেক্টের `.env` ফাইলে নিচের লাইনগুলো যুক্ত বা আপডেট করুন:

```env
# MySQL ডেটাবেস সংযোগ
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=yourcpanel_frend_db
DB_USERNAME=yourcpanel_db_user
DB_PASSWORD=your_db_password

# FREND WhatsApp Engine (আপনার Railway প্রজেক্টের URL দিন)
FREND_BOT_URL=https://your-railway-app-url.up.railway.app

# Google Gemini AI (স্মার্ট বাংলা রিমাইন্ডার ও বিশ্লেষণের জন্য)
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## ⏰ cPanel-এ ক্রনজব (Cron Job) সেটআপ (অটো-রিমাইন্ডারের জন্য)

নির্দিষ্ট সময়ে ব্যবহারকারীদের WhatsApp-এ রিমাইন্ডার পাঠানোর জন্য:
1. cPanel সার্চ বক্সে লিখুন: **"Cron Jobs"** এবং ক্লিক করুন।
2. **Common Settings**-এ সিলেক্ট করুন: `Every 1 Minute (* * * * *)` বা `Every 5 Minutes (*/5 * * * *)`
3. **Command** ঘরে নিচের কমান্ডটি পেস্ট করুন:
   ```bash
   curl -s https://yourdomain.com/cron/reminders/process > /dev/null 2>&1
   ```
4. **Add New Cron Job**-এ ক্লিক করুন।
এখন থেকে নির্দিষ্ট সময়ে স্বয়ংক্রিয়ভাবে WhatsApp-এ রিমাইন্ডার পাঠানো হবে!

---

## 🌐 ব্রাউজারে কন্ট্রোল সেন্টার ব্যবহার করুন

| পেজের নাম | ব্রাউজার URL | কাজ |
| :--- | :--- | :--- |
| **WhatsApp কন্ট্রোল সেন্টার** | `/admin/whatsapp` | লাইভ QR কোড স্ক্যান, পেয়ারিং কোড, কানেকশন স্ট্যাটাস ও টেস্ট মেসেজ পাঠানো |
| **নোট মেমোরি** | `/admin/notes` | নোট সংরক্ষণ, পিন, ফিল্টার ও সার্চ |
| **স্মার্ট রিমাইন্ডার** | `/admin/reminders` | রিমাইন্ডার শিডিউল, স্নুজ ও ১-ক্লিকে ডিসপ্যাচ |
| **মাইগ্রেশন ও ডেটাবেস** | `/admin/migrations` | ব্রাউজার থেকে মাইগ্রেশন রান, SQL ইমপোর্ট ও ক্যাশ পরিষ্কার |

---

## 💻 Laravel কোড থেকে সরাসরি WhatsApp মেসেজ পাঠানোর উদাহরণ

আপনার যেকোনো কন্ট্রোলার বা ইভেন্ট থেকে কাস্টমার বা ব্যবহারকারীকে WhatsApp মেসেজ পাঠাতে:

```php
use App\Services\FrendWhatsAppService;

class OrderController extends Controller
{
    public function notifyCustomer(FrendWhatsAppService $whatsapp)
    {
        // সরাসরি নম্বরে WhatsApp বার্তা পাঠান
        $whatsapp->sendMessage('01969091751', "🎉 আসসালামু আলাইকুম! আপনার অর্ডারটি কনফার্ম হয়েছে।");
    }
}
```
