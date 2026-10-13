<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->validateCsrfTokens(except: [
            'api/*',
            'cron/*',
            'admin/settings/artisan',
            'admin/settings/test-gemini',
            'admin/settings/test-bot',
            'admin/migrations/*',
            'admin/whatsapp/start',
            'admin/whatsapp/restart',
            'admin/whatsapp/logout',
            'admin/whatsapp/send',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
