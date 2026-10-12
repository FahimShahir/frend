<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\FrendAdminController;

/**
 * ─────────────────────────────────────────────────────────────
 * FREND WhatsApp Bot Routes
 * এই রুটগুলো আপনার Laravel প্রজেক্টের `routes/web.php` ফাইলে যোগ করুন।
 * ─────────────────────────────────────────────────────────────
 */

Route::prefix('admin/whatsapp')->name('admin.whatsapp.')->middleware(['web'])->group(function () {
    // ড্যাশবোর্ড পেজ ভিউ
    Route::get('/', [FrendAdminController::class, 'index'])->name('index');
    
    // লাইভ স্ট্যাটাস ও QR কোড AJAX API (প্রতি ২.৫ সেকেন্ড পর পর কল হয়)
    Route::get('/status', [FrendAdminController::class, 'status'])->name('status');
    
    // UI থেকে এক ক্লিকে বট চালু করা (npm start)
    Route::post('/start', [FrendAdminController::class, 'start'])->name('start');
    
    // বট রিস্টার্ট করা
    Route::post('/restart', [FrendAdminController::class, 'restart'])->name('restart');
    
    // সেশন ডিসকানেক্ট / লগআউট করা
    Route::post('/logout', [FrendAdminController::class, 'logout'])->name('logout');
    
    // সরাসরি মেসেজ পাঠানোর API
    Route::post('/send', [FrendAdminController::class, 'sendMessage'])->name('send');
});
