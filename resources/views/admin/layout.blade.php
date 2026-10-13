<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'FREND WhatsApp Assistant') — Laravel Control Center</title>
    
    <!-- Google Fonts: Inter & Outfit -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">

    <style>
        :root {
            --bg-base: #090d16;
            --bg-card: rgba(17, 24, 39, 0.75);
            --bg-card-hover: rgba(31, 41, 55, 0.85);
            --border-color: rgba(255, 255, 255, 0.08);
            --border-focus: rgba(6, 182, 212, 0.5);
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --accent-cyan: #06b6d4;
            --accent-violet: #8b5cf6;
            --accent-emerald: #10b981;
            --accent-amber: #f59e0b;
            --accent-rose: #f43f5e;
            --glass-blur: blur(16px);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        body {
            background-color: var(--bg-base);
            background-image: 
                radial-gradient(circle at 15% 15%, rgba(139, 92, 246, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 85% 85%, rgba(6, 182, 212, 0.08) 0%, transparent 40%);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
        }

        /* Sidebar Styling */
        .sidebar {
            width: 260px;
            background: rgba(13, 18, 30, 0.85);
            backdrop-filter: var(--glass-blur);
            border-right: 1px solid var(--border-color);
            padding: 24px 16px;
            display: flex;
            flex-direction: column;
            position: fixed;
            top: 0;
            bottom: 0;
            left: 0;
            z-index: 50;
        }

        .brand-logo {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 0 8px 24px 8px;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 20px;
        }

        .brand-icon {
            width: 40px;
            height: 40px;
            border-radius: 12px;
            background: linear-gradient(135deg, var(--accent-cyan), var(--accent-violet));
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            font-weight: bold;
            box-shadow: 0 4px 14px rgba(6, 182, 212, 0.3);
        }

        .brand-title {
            font-family: 'Outfit', sans-serif;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.5px;
            background: linear-gradient(135deg, #ffffff, #9ca3af);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .brand-badge {
            font-size: 10px;
            background: rgba(6, 182, 212, 0.15);
            color: var(--accent-cyan);
            padding: 2px 6px;
            border-radius: 6px;
            font-weight: 600;
            margin-left: auto;
        }

        .nav-links {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex-grow: 1;
        }

        .nav-link {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            border-radius: 10px;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .nav-link:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.05);
            transform: translateX(4px);
        }

        .nav-link.active {
            color: #ffffff;
            background: linear-gradient(90deg, rgba(6, 182, 212, 0.18), rgba(139, 92, 246, 0.08));
            border: 1px solid rgba(6, 182, 212, 0.3);
            font-weight: 600;
        }

        /* Main Content Container */
        .main-wrapper {
            margin-left: 260px;
            flex-grow: 1;
            padding: 28px 36px;
            max-width: calc(100vw - 260px);
        }

        /* Top Bar */
        .top-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 28px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border-color);
        }

        .page-title {
            font-family: 'Outfit', sans-serif;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.5px;
        }

        .top-bar-meta {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .status-pill {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            background: rgba(16, 185, 129, 0.12);
            color: var(--accent-emerald);
            border: 1px solid rgba(16, 185, 129, 0.25);
        }

        .status-pill.offline {
            background: rgba(244, 63, 94, 0.12);
            color: var(--accent-rose);
            border-color: rgba(244, 63, 94, 0.25);
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: currentColor;
            box-shadow: 0 0 8px currentColor;
        }

        /* Cards and Components */
        .card {
            background: var(--bg-card);
            backdrop-filter: var(--glass-blur);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            transition: border-color 0.2s ease;
        }

        .card:hover {
            border-color: rgba(255, 255, 255, 0.14);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border-color);
        }

        .card-title {
            font-size: 16px;
            font-weight: 600;
            color: #ffffff;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 18px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            text-decoration: none;
            transition: all 0.2s ease;
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--accent-cyan), #0284c7);
            color: #ffffff;
            box-shadow: 0 4px 14px rgba(6, 182, 212, 0.3);
        }
        .btn-primary:hover {
            opacity: 0.92;
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(6, 182, 212, 0.4);
        }

        .btn-secondary {
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            border: 1px solid var(--border-color);
        }
        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.14);
        }

        .btn-danger {
            background: rgba(244, 63, 94, 0.15);
            color: var(--accent-rose);
            border: 1px solid rgba(244, 63, 94, 0.3);
        }
        .btn-danger:hover {
            background: var(--accent-rose);
            color: #ffffff;
        }

        /* Alerts */
        .alert {
            padding: 14px 18px;
            border-radius: 12px;
            margin-bottom: 20px;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .alert-success {
            background: rgba(16, 185, 129, 0.12);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .alert-warning {
            background: rgba(245, 158, 11, 0.12);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.3);
        }

        /* Top Navigation Header Tabs */
        .header-nav-tabs {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(17, 24, 39, 0.6);
            backdrop-filter: var(--glass-blur);
            padding: 8px 12px;
            border-radius: 14px;
            border: 1px solid var(--border-color);
            margin-bottom: 24px;
            overflow-x: auto;
            scrollbar-width: none;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        }
        .header-nav-tabs::-webkit-scrollbar { display: none; }
        .header-tab {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            border-radius: 10px;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 13px;
            font-weight: 600;
            white-space: nowrap;
            transition: all 0.2s ease;
        }
        .header-tab:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.08);
            transform: translateY(-1px);
        }
        .header-tab.active {
            color: #ffffff;
            background: linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(139, 92, 246, 0.15));
            border: 1px solid rgba(6, 182, 212, 0.4);
            box-shadow: 0 2px 10px rgba(6, 182, 212, 0.2);
        }

        @media (max-width: 900px) {
            .sidebar { width: 70px; padding: 16px 8px; }
            .brand-title, .brand-badge, .nav-text { display: none; }
            .main-wrapper { margin-left: 70px; max-width: calc(100vw - 70px); padding: 20px 16px; }
        }
    </style>
    @yield('styles')
</head>
<body>
    <!-- Sidebar -->
    <aside class="sidebar">
        <a href="{{ route('admin.whatsapp.index') }}" class="brand-logo" style="text-decoration: none; cursor: pointer;">
            <div class="brand-icon">🤖</div>
            <div class="brand-title">FREND</div>
            <span class="brand-badge">Laravel</span>
        </a>

        <ul class="nav-links">
            <li>
                <a href="{{ route('admin.whatsapp.index') }}" class="nav-link {{ request()->routeIs('admin.whatsapp.*') ? 'active' : '' }}">
                    <span>📡</span>
                    <span class="nav-text">WhatsApp কন্ট্রোল</span>
                </a>
            </li>
            <li>
                <a href="{{ route('admin.users.index') }}" class="nav-link {{ request()->routeIs('admin.users.*') ? 'active' : '' }}">
                    <span>👥</span>
                    <span class="nav-text">ইউজার ম্যানেজমেন্ট</span>
                </a>
            </li>
            <li>
                <a href="{{ route('admin.notes.index') }}" class="nav-link {{ request()->routeIs('admin.notes.*') ? 'active' : '' }}">
                    <span>📝</span>
                    <span class="nav-text">নোট মেমোরি</span>
                </a>
            </li>
            <li>
                <a href="{{ route('admin.reminders.index') }}" class="nav-link {{ request()->routeIs('admin.reminders.*') ? 'active' : '' }}">
                    <span>⏰</span>
                    <span class="nav-text">স্মার্ট রিমাইন্ডার</span>
                </a>
            </li>
            <li>
                <a href="{{ route('admin.migrations.index') }}" class="nav-link {{ request()->routeIs('admin.migrations.*') ? 'active' : '' }}">
                    <span>🐬</span>
                    <span class="nav-text">মাইগ্রেশন ও ডেটাবেস</span>
                </a>
            </li>
            <li>
                <a href="{{ route('admin.settings.index') }}" class="nav-link {{ request()->routeIs('admin.settings.*') ? 'active' : '' }}">
                    <span>⚙️</span>
                    <span class="nav-text">ওয়েব টার্মিনাল ও সেটিংস</span>
                </a>
            </li>
        </ul>

        <div style="padding-top: 16px; border-top: 1px solid var(--border-color); font-size: 11px; color: var(--text-muted); text-align: center;">
            FREND Assistant v2.0<br>cPanel & MySQL Shared
        </div>
    </aside>

    <!-- Main Content -->
    <main class="main-wrapper">
        <!-- Top Navigation Header Tabs (হেডারের সমস্ত পেজের লিংক) -->
        <nav class="header-nav-tabs">
            <a href="{{ route('admin.whatsapp.index') }}" class="header-tab {{ request()->routeIs('admin.whatsapp.*') ? 'active' : '' }}">
                <span>📡</span> <span>WhatsApp কন্ট্রোল</span>
            </a>
            <a href="{{ route('admin.users.index') }}" class="header-tab {{ request()->routeIs('admin.users.*') ? 'active' : '' }}">
                <span>👥</span> <span>ইউজার ম্যানেজমেন্ট</span>
            </a>
            <a href="{{ route('admin.notes.index') }}" class="header-tab {{ request()->routeIs('admin.notes.*') ? 'active' : '' }}">
                <span>📝</span> <span>নোট মেমোরি</span>
            </a>
            <a href="{{ route('admin.reminders.index') }}" class="header-tab {{ request()->routeIs('admin.reminders.*') ? 'active' : '' }}">
                <span>⏰</span> <span>স্মার্ট রিমাইন্ডার</span>
            </a>
            <a href="{{ route('admin.migrations.index') }}" class="header-tab {{ request()->routeIs('admin.migrations.*') ? 'active' : '' }}">
                <span>🐬</span> <span>মাইগ্রেশন ও ডেটাবেস</span>
            </a>
            <a href="{{ route('admin.settings.index') }}" class="header-tab {{ request()->routeIs('admin.settings.*') ? 'active' : '' }}">
                <span>⚙️</span> <span>ওয়েব টার্মিনাল ও সেটিংস</span>
            </a>
        </nav>

        <div class="top-bar">
            <div>
                <h1 class="page-title">@yield('page_title', 'ড্যাশবোর্ড')</h1>
                <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">@yield('page_subtitle', 'স্মার্ট সহকারী নিয়ন্ত্রণ কেন্দ্র')</p>
            </div>
            <div class="top-bar-meta">
                <div class="status-pill" id="globalStatusPill">
                    <div class="status-dot"></div>
                    <span id="globalStatusText">অনলাইন</span>
                </div>
                <div style="font-size: 13px; color: var(--text-muted);">
                    <a href="https://test330.xyz" target="_blank" style="color: var(--text-muted); text-decoration: none;" title="লাইভ ওয়েবসাইট খুলুন">🌐 test330.xyz</a>
                </div>
            </div>
        </div>

        @if(session('success'))
            <div class="alert alert-success">
                <span>✅</span>
                <span>{{ session('success') }}</span>
            </div>
        @endif

        @if(session('warning'))
            <div class="alert alert-warning">
                <span>⚠️</span>
                <span>{{ session('warning') }}</span>
            </div>
        @endif

        @yield('content')
    </main>

    <script>
        // গ্লোবাল স্ট্যাটাস সিঙ্ক (প্রতি ৬ সেকেন্ডে)
        async function syncGlobalBotStatus() {
            try {
                const res = await fetch('{{ route("admin.whatsapp.status") }}');
                const data = await res.json();
                const pill = document.getElementById('globalStatusPill');
                const txt = document.getElementById('globalStatusText');
                if (!pill || !txt) return;

                if (data.status === 'CONNECTED') {
                    pill.className = 'status-pill';
                    txt.innerText = 'অনলাইন (' + (data.userPhone || 'সক্রিয়') + ')';
                } else if (data.status === 'OFFLINE') {
                    pill.className = 'status-pill offline';
                    txt.innerText = 'বট অফলাইন';
                } else {
                    pill.className = 'status-pill offline';
                    txt.innerText = 'QR স্ক্যান প্রয়োজন';
                }
            } catch (_) {}
        }
        syncGlobalBotStatus();
        setInterval(syncGlobalBotStatus, 6000);
    </script>
    @yield('scripts')
</body>
</html>
