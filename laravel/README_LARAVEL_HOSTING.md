# 🚀 FREND WhatsApp Bot — Shared Hosting & Laravel Integration গাইড

এই গাইডে বিস্তারিতভাবে বলা হয়েছে কীভাবে আপনি **টার্মিনাল ছাড়া সরাসরি ড্যাশবোর্ড থেকেই WhatsApp QR কোড স্ক্যান করবেন**, **এক ক্লিকে বট চালু করবেন**, এবং আপনার **Shared Hosting (cPanel)-এ থাকা Laravel প্রজেক্টের** সাথে এটিকে যুক্ত করবেন।

---

## 🎯 আপনার সমস্যার সমাধান ও আর্কিটেকচার

1. **টার্মিনাল ছাড়াই QR কোড স্ক্যান:**  
   এখন আর টার্মিনাল বা কনসোলে কিউআর কোড দেখার প্রয়োজন নেই। আপনি ব্রাউজারে ড্যাশবোর্ড খুললেই সরাসরি ঝকঝকে QR কোড দেখতে পাবেন এবং ফোন দিয়ে স্ক্যান করলেই স্বয়ংক্রিয়ভাবে কানেক্ট হয়ে যাবে।

2. **UI থেকেই বট স্টার্ট/স্টপ (npm start):**  
   Laravel অ্যাডমিন প্যানেলে **"🚀 বট চালু করুন (npm start)"**, **"🔄 রিস্টার্ট"**, এবং **"🔌 ডিসকানেক্ট"** বাটন রয়েছে।

3. **PHP ও Laravel ইন্টিগ্রেশন:**  
   হোস্টিংয়ে PHP ও Laravel চলবে, আর ব্যাকগ্রাউন্ডে Node.js সার্ভিসটি পোর্ট `3000`-এ চলবে। Laravel কন্ট্রোলার এবং ব্লেড ভিউ সরাসরি API-এর মাধ্যমে যুক্ত থাকবে।

---

## 📁 Laravel প্রজেক্টে ফাইলগুলো যুক্ত করার নিয়ম (মাত্র ৪টি ধাপ)

আমরা `frend/laravel/` ফোল্ডারে আপনার জন্য সব ফাইল তৈরি করে রেখেছি:

### ধাপ ১: সার্ভিস ফাইল কপি করুন
`frend/laravel/FrendWhatsAppService.php` ফাইলটি আপনার Laravel প্রজেক্টের এই ফোল্ডারে রাখুন:
```
app/Services/FrendWhatsAppService.php
```

### ধাপ ২: কন্ট্রোলার কপি করুন
`frend/laravel/FrendAdminController.php` ফাইলটি আপনার Laravel প্রজেক্টের এই ফোল্ডারে রাখুন:
```
app/Http/Controllers/FrendAdminController.php
```

### ধাপ ৩: ব্লেড ভিউ কপি করুন
`frend/laravel/whatsapp.blade.php` ফাইলটি আপনার Laravel প্রজেক্টের এই ফোল্ডারে রাখুন:
```
resources/views/admin/whatsapp.blade.php
```

### ধাপ ৪: রুট যোগ করুন
আপনার Laravel প্রজেক্টের `routes/web.php` ফাইলে নিচের কোডটুকু পেস্ট করুন (অথবা `frend/laravel/routes_snippet.php` দেখুন):

```php
use App\Http\Controllers\FrendAdminController;

Route::prefix('admin/whatsapp')->name('admin.whatsapp.')->middleware(['web'])->group(function () {
    Route::get('/', [FrendAdminController::class, 'index'])->name('index');
    Route::get('/status', [FrendAdminController::class, 'status'])->name('status');
    Route::post('/start', [FrendAdminController::class, 'start'])->name('start');
    Route::post('/restart', [FrendAdminController::class, 'restart'])->name('restart');
    Route::post('/logout', [FrendAdminController::class, 'logout'])->name('logout');
    Route::post('/send', [FrendAdminController::class, 'sendMessage'])->name('send');
});
```

### ধাপ ৫: `.env` ফাইলে কনফিগ যোগ করুন
আপনার Laravel প্রজেক্টের `.env` ফাইলের শেষে যোগ করুন:
```env
FREND_BOT_URL=http://127.0.0.1:3000
FREND_BOT_PATH=/home/yourcpanelusername/frend
```

এখন ব্রাউজারে যান: `https://yourdomain.com/admin/whatsapp` 🎉

---

## 🌐 Shared Hosting (cPanel)-এ হোস্টিং করার উপায়

### পদ্ধতি ১: cPanel-এর "Setup Node.js App" (সবচেয়ে সহজ ও সেরা)
বর্তমানে অধিকাংশ cPanel শেয়ার্ড হোস্টিংয়ে **Node.js Selector** বা **Setup Node.js App** থাকে।

1. **ফাইল আপলোড করুন:**  
   `frend` ফোল্ডারটি জিপ (Zip) করে আপনার cPanel-এর মূল ডিরেক্টরিতে (যেমন: `/home/username/frend`) আপলোড করে আনজিপ করুন।
2. **Setup Node.js App-এ যান:**  
   cPanel সার্চ বক্সে লিখুন **"Setup Node.js App"** এবং ক্লিক করুন।
3. **নতুন অ্যাপ তৈরি করুন (Create Application):**
   - **Node.js version:** `20.x` বা `18.x` সিলেক্ট করুন।
   - **Application mode:** `Production`
   - **Application root:** `frend`
   - **Application startup file:** `index.js`
   - **Application URL:** খালি বা সাব-ডোমেন দিন।
4. **ডিপেন্ডেন্সি ইন্সটল:**  
   **Run NPM Install** বাটনে ক্লিক করুন।
5. **Start Application:**  
   **Start App** বাটনে ক্লিক করুন। বট পোর্ট `3000`-এ ব্যাকগ্রাউন্ডে চালু হয়ে যাবে এবং ২৪ ঘণ্টা চালু থাকবে!

---

### পদ্ধতি ২: শেয়ার্ড হোস্টিংয়ে Node.js সাপোর্ট না থাকলে (বিকল্প উপায়)
শেয়ার্ড হোস্টিংয়ে যদি Chromium লাইব্রেরি না থাকে:
1. বটের Node.js অংশটি একটি ফ্রি ক্লাউড সার্ভিসে (যেমন: Render, Railway, বা ওরাকল ক্লাউড ফ্রি টিয়ার) হোস্টিং করুন।
2. অথবা আপনার বাসা বা অফিসের পিসিতে বটটি চালু রেখে **Cloudflare Tunnel** দিয়ে ইন্টারনেটে লাইভ করুন।
3. আপনার শেয়ার্ড হোস্টিংয়ের Laravel `.env` ফাইলে শুধু URL-টি দিয়ে দিন:
   ```env
   FREND_BOT_URL=https://your-frend-bot-url.com
   ```
ব্যাস! আপনার শেয়ার্ড হোস্টিংয়ের Laravel অ্যাডমিন ড্যাশবোর্ড থেকেই সবকিছু কন্ট্রোল করতে পারবেন।

---

## 💬 Laravel থেকে সরাসরি WhatsApp মেসেজ পাঠানোর উদাহরণ

আপনার Laravel কন্ট্রোলার বা যেকোনো কোড থেকে ক্লায়েন্ট বা ইউজারদের মেসেজ পাঠাতে:

```php
use App\Services\FrendWhatsAppService;

class OrderController extends Controller
{
    public function orderSuccess(Request $request, FrendWhatsAppService $whatsapp)
    {
        // গ্রাহকের নম্বরে সরাসরি বার্তা পাঠান
        $whatsapp->sendMessage('01712345678', "ধন্যবাদ! আপনার অর্ডার #1029 সফল হয়েছে।");
    }
}
```
