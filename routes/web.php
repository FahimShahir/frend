<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\FrendAdminController;
use App\Http\Controllers\FrendNotesController;
use App\Http\Controllers\FrendRemindersController;
use App\Http\Controllers\SystemMigrationController;
use App\Http\Controllers\WhatsAppWebhookController;

// রুট পেজে গেলে সরাসরি WhatsApp কন্ট্রোল সেন্টারে রিডাইরেক্ট হবে
Route::get('/', function () {
    return redirect('/admin/whatsapp');
});

Route::prefix('admin')->name('admin.')->middleware(['web'])->group(function () {

    // 1. WhatsApp বট কন্ট্রোল সেন্টার
    Route::prefix('whatsapp')->name('whatsapp.')->group(function () {
        Route::get('/', [FrendAdminController::class, 'index'])->name('index');
        Route::get('/status', [FrendAdminController::class, 'status'])->name('status');
        Route::post('/start', [FrendAdminController::class, 'start'])->name('start');
        Route::post('/restart', [FrendAdminController::class, 'restart'])->name('restart');
        Route::post('/logout', [FrendAdminController::class, 'logout'])->name('logout');
        Route::post('/send', [FrendAdminController::class, 'sendMessage'])->name('send');
    });

    // 2. নোট ও মেমোরি ম্যানেজমেন্ট
    Route::prefix('notes')->name('notes.')->group(function () {
        Route::get('/', [FrendNotesController::class, 'index'])->name('index');
        Route::post('/', [FrendNotesController::class, 'store'])->name('store');
        Route::post('/{id}/pin', [FrendNotesController::class, 'togglePin'])->name('pin');
        Route::delete('/{id}', [FrendNotesController::class, 'destroy'])->name('destroy');
    });

    // 3. স্মার্ট রিমাইন্ডার ও ডিসপ্যাচার
    Route::prefix('reminders')->name('reminders.')->group(function () {
        Route::get('/', [FrendRemindersController::class, 'index'])->name('index');
        Route::post('/', [FrendRemindersController::class, 'store'])->name('store');
        Route::post('/dispatch', [FrendRemindersController::class, 'triggerDispatch'])->name('dispatch');
        Route::post('/{id}/snooze', [FrendRemindersController::class, 'snooze'])->name('snooze');
        Route::delete('/{id}', [FrendRemindersController::class, 'destroy'])->name('destroy');
    });

    // 4. cPanel শেয়ার্ড হোস্টিংয়ের জন্য ওয়েব মাইগ্রেশন ও ডেটাবেস কন্ট্রোল (SSH ছাড়া)
    Route::prefix('migrations')->name('migrations.')->group(function () {
        Route::get('/', [SystemMigrationController::class, 'index'])->name('index');
        Route::post('/run', [SystemMigrationController::class, 'runMigrations'])->name('run');
        Route::post('/import-sql', [SystemMigrationController::class, 'importSqlFile'])->name('import-sql');
        Route::post('/clear-cache', [SystemMigrationController::class, 'clearCache'])->name('clear-cache');
        Route::post('/rollback', [SystemMigrationController::class, 'rollbackMigrations'])->name('rollback');
    });
});

// 5. cPanel ক্রনজব URL (টার্মিনাল ছাড়া নির্দিষ্ট সময়ে রিমাইন্ডার পাঠাতে cPanel Cron থেকে এই URL হিট করবেন)
Route::get('/cron/reminders/process', [WhatsAppWebhookController::class, 'cpanelCronTrigger']);

// 6. WhatsApp Webhook endpoint (API)
Route::post('/api/whatsapp/webhook', [WhatsAppWebhookController::class, 'handleIncomingMessage']);
