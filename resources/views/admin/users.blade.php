@extends('admin.layout')

@section('title', 'ইউজার ও একাউন্ট ম্যানেজমেন্ট')
@section('page_title', 'ইউজার ও একাউন্ট নিয়ন্ত্রণ')
@section('page_subtitle', 'সিস্টেমের অথরাইজড ব্যবহারকারী, হোয়াটসঅ্যাপ বাইন্ডিং, রোল ও সাবস্ক্রিপশন প্ল্যান পরিচালনা')

@section('styles')
<style>
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
    }
    .stat-card {
        background: var(--bg-card);
        backdrop-filter: var(--glass-blur);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        padding: 18px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .stat-val {
        font-size: 26px;
        font-weight: 800;
        color: #fff;
        line-height: 1.2;
    }
    .stat-lbl {
        font-size: 12px;
        color: var(--text-muted);
        margin-top: 4px;
    }
    .stat-icon {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
    }

    .table-container {
        overflow-x: auto;
    }
    .users-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        text-align: left;
    }
    .users-table th {
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.03);
        color: var(--text-muted);
        font-weight: 600;
        border-bottom: 1px solid var(--border-color);
        white-space: nowrap;
    }
    .users-table td {
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        color: #e5e7eb;
        vertical-align: middle;
    }
    .users-table tr:hover td {
        background: rgba(255, 255, 255, 0.02);
    }

    .badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
    }
    .badge-admin {
        background: rgba(139, 92, 246, 0.15);
        color: var(--accent-violet);
        border: 1px solid rgba(139, 92, 246, 0.3);
    }
    .badge-user {
        background: rgba(6, 182, 212, 0.15);
        color: var(--accent-cyan);
        border: 1px solid rgba(6, 182, 212, 0.3);
    }
    .badge-active {
        background: rgba(16, 185, 129, 0.15);
        color: var(--accent-emerald);
        border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-disabled {
        background: rgba(245, 158, 11, 0.15);
        color: var(--accent-amber);
        border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .badge-blocked {
        background: rgba(244, 63, 94, 0.15);
        color: var(--accent-rose);
        border: 1px solid rgba(244, 63, 94, 0.3);
    }

    .badge-plan {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--border-color);
        color: #fff;
    }
    .badge-enterprise {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2));
        border: 1px solid rgba(139, 92, 246, 0.4);
        color: #c4b5fd;
    }
    .badge-pro {
        background: rgba(6, 182, 212, 0.2);
        border: 1px solid rgba(6, 182, 212, 0.4);
        color: #67e8f9;
    }

    /* Modal styling */
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(8px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
    }
    .modal-box {
        background: #0f172a;
        border: 1px solid var(--border-color);
        border-radius: 18px;
        width: 100%;
        max-width: 520px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
        overflow: hidden;
    }
    .modal-header {
        padding: 18px 24px;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .modal-body {
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
    .modal-footer {
        padding: 16px 24px;
        border-top: 1px solid var(--border-color);
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        background: rgba(0,0,0,0.2);
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .form-group label {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-muted);
    }
    .form-ctrl {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 10px 14px;
        color: #fff;
        font-size: 13px;
        outline: none;
        width: 100%;
    }
    .form-ctrl:focus {
        border-color: var(--accent-cyan);
    }
    .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }
    .action-btn-group {
        display: flex;
        gap: 6px;
        align-items: center;
    }
    .btn-icon {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border-color);
        color: var(--text-muted);
        border-radius: 8px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s;
        text-decoration: none;
    }
    .btn-icon:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
    }
</style>
@endsection

@section('content')
<!-- 1. Stats Counter Cards -->
<div class="stats-grid">
    <div class="stat-card">
        <div>
            <div class="stat-val">{{ $stats['total'] }}</div>
            <div class="stat-lbl">মোট ব্যবহারকারী</div>
        </div>
        <div class="stat-icon" style="background: rgba(6, 182, 212, 0.12); color: var(--accent-cyan);">👥</div>
    </div>

    <div class="stat-card">
        <div>
            <div class="stat-val" style="color: var(--accent-emerald);">{{ $stats['active'] }}</div>
            <div class="stat-lbl">সক্রিয় একাউন্ট</div>
        </div>
        <div class="stat-icon" style="background: rgba(16, 185, 129, 0.12); color: var(--accent-emerald);">🟢</div>
    </div>

    <div class="stat-card">
        <div>
            <div class="stat-val" style="color: var(--accent-violet);">{{ $stats['admins'] }}</div>
            <div class="stat-lbl">সিস্টেম অ্যাডমিন</div>
        </div>
        <div class="stat-icon" style="background: rgba(139, 92, 246, 0.12); color: var(--accent-violet);">🛡️</div>
    </div>

    <div class="stat-card">
        <div>
            <div class="stat-val" style="color: #60a5fa;">{{ $stats['linked_phone'] }}</div>
            <div class="stat-lbl">হোয়াটসঅ্যাপ লিংকড</div>
        </div>
        <div class="stat-icon" style="background: rgba(96, 165, 250, 0.12); color: #60a5fa;">📱</div>
    </div>
</div>

<!-- 2. Search, Filter & Add User Toolbar -->
<div class="card" style="margin-bottom: 20px; padding: 18px 24px;">
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <form method="GET" action="{{ route('admin.users.index') }}" style="display: flex; gap: 10px; flex-wrap: wrap; flex-grow: 1; max-width: 800px;">
            <input type="text" name="q" value="{{ $search ?? '' }}" placeholder="ইউজারনেম, নাম বা ফোন নম্বর খুঁজুন..." 
                   style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 13px; flex-grow: 1; min-width: 220px; outline: none;">
            
            <select name="role" style="background: rgba(17, 24, 39, 0.8); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 13px; outline: none;">
                <option value="">সকল রোল</option>
                <option value="admin" {{ ($roleFilter ?? '') === 'admin' ? 'selected' : '' }}>🛡️ Admin</option>
                <option value="user" {{ ($roleFilter ?? '') === 'user' ? 'selected' : '' }}>👤 User</option>
            </select>

            <select name="status" style="background: rgba(17, 24, 39, 0.8); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 13px; outline: none;">
                <option value="">সকল স্ট্যাটাস</option>
                <option value="active" {{ ($statusFilter ?? '') === 'active' ? 'selected' : '' }}>🟢 Active</option>
                <option value="disabled" {{ ($statusFilter ?? '') === 'disabled' ? 'selected' : '' }}>🟡 Disabled</option>
                <option value="blocked" {{ ($statusFilter ?? '') === 'blocked' ? 'selected' : '' }}>🔴 Blocked</option>
            </select>

            <select name="plan" style="background: rgba(17, 24, 39, 0.8); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 13px; outline: none;">
                <option value="">সকল প্ল্যান</option>
                @foreach($plans as $p)
                    <option value="{{ $p->id }}" {{ ($planFilter ?? '') === $p->id ? 'selected' : '' }}>{{ $p->name }}</option>
                @endforeach
            </select>

            <button type="submit" class="btn btn-secondary">🔍 ফিল্টার</button>
            @if(!empty($search) || !empty($roleFilter) || !empty($statusFilter) || !empty($planFilter))
                <a href="{{ route('admin.users.index') }}" class="btn btn-secondary">রিসেট</a>
            @endif
        </form>

        <button type="button" class="btn btn-primary" onclick="openCreateModal()">
            <span>➕</span> <span>নতুন ইউজার তৈরি করুন</span>
        </button>
    </div>
</div>

<!-- 3. Users Table Card -->
<div class="card" style="padding: 0; overflow: hidden;">
    <div class="card-header" style="margin: 0; padding: 18px 24px; border-bottom: 1px solid var(--border-color);">
        <div class="card-title">
            <span>👥</span> <span>নিবন্ধিত ব্যবহারকারী তালিকা ({{ $users->count() }} জন)</span>
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">
            পাসওয়ার্ড পরিবর্তন, রোল অ্যাসাইন এবং WhatsApp বাইন্ডিং নিয়ন্ত্রণ
        </div>
    </div>

    <div class="table-container">
        <table class="users-table">
            <thead>
                <tr>
                    <th>আইডি ও নাম</th>
                    <th>রোল</th>
                    <th>সাবস্ক্রিপশন প্ল্যান</th>
                    <th>WhatsApp নম্বর / LID</th>
                    <th>স্ট্যাটাস</th>
                    <th>মেমোরি ডেটা</th>
                    <th>যোগদানের তারিখ</th>
                    <th style="text-align: right;">একশন</th>
                </tr>
            </thead>
            <tbody>
                @forelse($users as $user)
                    <tr>
                        <td>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <div style="width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, {{ $user->role === 'admin' ? 'var(--accent-violet)' : 'var(--accent-cyan)' }}, #1e293b); display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; font-size: 14px;">
                                    {{ strtoupper(substr($user->username, 0, 1)) }}
                                </div>
                                <div>
                                    <div style="font-weight: 600; color: #fff; font-size: 14px;">
                                        {{ $user->display_name ?: $user->username }}
                                    </div>
                                    <div style="font-size: 12px; color: var(--text-muted); font-family: monospace;">
                                        &#64;{{ $user->username }}
                                    </div>
                                </div>
                            </div>
                        </td>

                        <td>
                            @if($user->role === 'admin')
                                <span class="badge badge-admin">🛡️ Admin</span>
                            @else
                                <span class="badge badge-user">👤 User</span>
                            @endif
                        </td>

                        <td>
                            @php
                                $planId = $user->assigned_plan_id;
                                $planName = $user->plan ? $user->plan->name : ucfirst($planId);
                            @endphp
                            @if($planId === 'enterprise')
                                <span class="badge badge-enterprise">👑 {{ $planName }}</span>
                            @elseif($planId === 'pro')
                                <span class="badge badge-pro">⚡ {{ $planName }}</span>
                            @else
                                <span class="badge badge-plan">📦 {{ $planName }}</span>
                            @endif
                        </td>

                        <td>
                            @if(!empty($user->bound_phone))
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 14px;">📱</span>
                                    <span style="font-family: monospace; font-size: 12px; color: #a5f3fc;" title="{{ $user->bound_phone }}">
                                        {{ Str::limit($user->bound_phone, 22) }}
                                    </span>
                                    <form method="POST" action="{{ route('admin.users.unbind-phone', $user->id) }}" onsubmit="return confirm('আপনি কি {{ $user->username }}-এর সাথে WhatsApp সংযোগ বিচ্ছিন্ন করতে চান?');" style="display:inline;">
                                        @csrf
                                        <button type="submit" style="background: none; border: none; cursor: pointer; color: var(--accent-rose); font-size: 11px; padding: 2px 4px;" title="ফোন আনবাইন্ড করুন">✕</button>
                                    </form>
                                </div>
                            @else
                                <span style="font-size: 12px; color: var(--text-muted); font-style: italic;">কানেক্ট করা হয়নি</span>
                            @endif
                        </td>

                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="badge badge-{{ $user->status }}">
                                    {{ ucfirst($user->status) }}
                                </span>
                                <!-- Quick Status Changer -->
                                <form method="POST" action="{{ route('admin.users.status', $user->id) }}" style="display: inline;">
                                    @csrf
                                    <select name="status" onchange="this.form.submit()" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 6px; color: #9ca3af; font-size: 10px; cursor: pointer;">
                                        <option value="active" {{ $user->status === 'active' ? 'selected' : '' }}>সক্রিয়</option>
                                        <option value="disabled" {{ $user->status === 'disabled' ? 'selected' : '' }}>নিষ্ক্রিয়</option>
                                        <option value="blocked" {{ $user->status === 'blocked' ? 'selected' : '' }}>ব্লকড</option>
                                    </select>
                                </form>
                            </div>
                        </td>

                        <td>
                            <div style="font-size: 11px; color: var(--text-muted); display: flex; flex-direction: column; gap: 2px;">
                                <span>📝 নোট: <strong style="color: #fff;">{{ $user->notes()->count() }}টি</strong></span>
                                <span>⏰ রিমাইন্ডার: <strong style="color: #fff;">{{ $user->reminders()->count() }}টি</strong></span>
                            </div>
                        </td>

                        <td style="font-size: 12px; color: var(--text-muted);">
                            {{ $user->created_at ? $user->created_at->format('d M, Y') : '-' }}
                        </td>

                        <td style="text-align: right;">
                            <div class="action-btn-group" style="justify-content: flex-end;">
                                <button type="button" class="btn-icon" title="এডিট করুন" onclick="openEditModal({{ json_encode($user) }})">
                                    ✏️
                                </button>
                                <button type="button" class="btn-icon" title="পাসওয়ার্ড রিসেট" onclick="openResetPasswordModal({{ $user->id }}, '{{ $user->username }}')">
                                    🔑
                                </button>
                                <form method="POST" action="{{ route('admin.users.destroy', $user->id) }}" onsubmit="return confirm('আপনি কি নিশ্চিত যে \'{{ $user->username }}\' একাউন্টটি মুছে ফেলতে চান?');" style="display: inline;">
                                    @csrf
                                    @method('DELETE')
                                    <button type="submit" class="btn-icon" style="color: var(--accent-rose);" title="মুছে ফেলুন">
                                        🗑️
                                    </button>
                                </form>
                            </div>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
                            <div style="font-size: 36px; margin-bottom: 8px;">🔍</div>
                            <div>কোনো ব্যবহারকারী পাওয়া যায়নি</div>
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>
</div>

<!-- 4. Subscription Plans Overview Section -->
<div class="card" style="margin-top: 24px;">
    <div class="card-header">
        <div class="card-title">
            <span>📦</span> <span>সিস্টেম সাবস্ক্রিপশন প্ল্যানসমূহ</span>
        </div>
        <span style="font-size: 12px; color: var(--text-muted);">প্রত্যেক প্ল্যানের লিমিট ও ফিচার ক্যাপাসিটি</span>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px;">
        @foreach($plans as $plan)
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 12px; padding: 18px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="font-size: 16px; font-weight: 700; color: #fff;">{{ $plan->name }}</div>
                    <span class="badge {{ $plan->id === 'enterprise' ? 'badge-enterprise' : ($plan->id === 'pro' ? 'badge-pro' : 'badge-plan') }}">
                        {{ strtoupper($plan->id) }}
                    </span>
                </div>

                <div style="font-size: 12px; color: var(--text-muted); line-height: 1.6; margin-bottom: 14px;">
                    <div>📝 সর্বোচ্চ নোট: <strong style="color: #fff;">{{ $plan->limits['max_notes'] ?? 'আনলিমিটেড' }}টি</strong></div>
                    <div>⏰ সর্বোচ্চ রিমাইন্ডার: <strong style="color: #fff;">{{ $plan->limits['max_reminders'] ?? 'আনলিমিটেড' }}টি</strong></div>
                    <div>🎙️ ভয়েস প্রসেসিং: <strong style="color: {{ !empty($plan->limits['voice']) ? '#34d399' : '#9ca3af' }};">{{ !empty($plan->limits['voice']) ? 'সক্রিয়' : 'অনুপলব্ধ' }}</strong></div>
                    <div>🖼️ ভিশন ও ইমেজ: <strong style="color: {{ !empty($plan->limits['vision']) ? '#34d399' : '#9ca3af' }};">{{ !empty($plan->limits['vision']) ? 'সক্রিয়' : 'অনুপলব্ধ' }}</strong></div>
                </div>

                <div style="font-size: 11px; color: var(--accent-cyan);">
                    সক্রিয় ইউজার: <strong>{{ $plan->users()->count() }} জন</strong>
                </div>
            </div>
        @endforeach
    </div>
</div>

<!-- Modal: Create New User -->
<div class="modal-backdrop" id="createUserModal">
    <div class="modal-box">
        <form method="POST" action="{{ route('admin.users.store') }}">
            @csrf
            <div class="modal-header">
                <div style="font-size: 16px; font-weight: 700; color: #fff;">➕ নতুন ব্যবহারকারী তৈরি করুন</div>
                <button type="button" onclick="closeCreateModal()" style="background: none; border: none; color: #9ca3af; font-size: 18px; cursor: pointer;">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-row-2">
                    <div class="form-group">
                        <label>ইউজারনেম (Username) *</label>
                        <input type="text" name="username" class="form-ctrl" placeholder="যেমন: shahir123" required autocomplete="off">
                    </div>
                    <div class="form-group">
                        <label>পাসওয়ার্ড (Password) *</label>
                        <input type="password" name="password" class="form-ctrl" placeholder="ন্যূনতম ৩ অক্ষর" required autocomplete="new-password">
                    </div>
                </div>

                <div class="form-group">
                    <label>প্রদর্শন নাম (Display Name)</label>
                    <input type="text" name="display_name" class="form-ctrl" placeholder="যেমন: ফাহিম শাহির">
                </div>

                <div class="form-group">
                    <label>WhatsApp নম্বর / JID (ঐচ্ছিক)</label>
                    <input type="text" name="bound_phone" class="form-ctrl" placeholder="যেমন: 88017XXXXXXXX">
                    <span style="font-size: 11px; color: var(--text-muted);">দেশ কোডসহ আন্তর্জাতিক নম্বর লিখুন (যেমন: 8801XXXXXXXXX)</span>
                </div>

                <div class="form-row-2">
                    <div class="form-group">
                        <label>রোল (Role) *</label>
                        <select name="role" class="form-ctrl">
                            <option value="user">👤 সাধারণ ব্যবহারকারী (User)</option>
                            <option value="admin">🛡️ সিস্টেম অ্যাডমিন (Admin)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>সাবস্ক্রিপশন প্ল্যান *</label>
                        <select name="assigned_plan_id" class="form-ctrl">
                            @foreach($plans as $p)
                                <option value="{{ $p->id }}" {{ $p->id === 'free' ? 'selected' : '' }}>{{ $p->name }}</option>
                            @endforeach
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label>স্ট্যাটাস *</label>
                    <select name="status" class="form-ctrl">
                        <option value="active">🟢 Active (সক্রিয়)</option>
                        <option value="disabled">🟡 Disabled (নিষ্ক্রিয়)</option>
                        <option value="blocked">🔴 Blocked (ব্লকড)</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeCreateModal()">বাতিল</button>
                <button type="submit" class="btn btn-primary">তৈরি করুন</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: Edit User -->
<div class="modal-backdrop" id="editUserModal">
    <div class="modal-box">
        <form method="POST" id="editUserForm" action="">
            @csrf
            <div class="modal-header">
                <div style="font-size: 16px; font-weight: 700; color: #fff;">✏️ ব্যবহারকারী এডিট করুন: <span id="editModalUsername" style="color: var(--accent-cyan);"></span></div>
                <button type="button" onclick="closeEditModal()" style="background: none; border: none; color: #9ca3af; font-size: 18px; cursor: pointer;">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>প্রদর্শন নাম (Display Name)</label>
                    <input type="text" name="display_name" id="editDisplayName" class="form-ctrl">
                </div>

                <div class="form-group">
                    <label>WhatsApp নম্বর / JID</label>
                    <input type="text" name="bound_phone" id="editBoundPhone" class="form-ctrl">
                </div>

                <div class="form-row-2">
                    <div class="form-group">
                        <label>রোল (Role)</label>
                        <select name="role" id="editRole" class="form-ctrl">
                            <option value="user">👤 সাধারণ ব্যবহারকারী (User)</option>
                            <option value="admin">🛡️ সিস্টেম অ্যাডমিন (Admin)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>সাবস্ক্রিপশন প্ল্যান</label>
                        <select name="assigned_plan_id" id="editPlan" class="form-ctrl">
                            @foreach($plans as $p)
                                <option value="{{ $p->id }}">{{ $p->name }}</option>
                            @endforeach
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label>স্ট্যাটাস</label>
                    <select name="status" id="editStatus" class="form-ctrl">
                        <option value="active">🟢 Active</option>
                        <option value="disabled">🟡 Disabled</option>
                        <option value="blocked">🔴 Blocked</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>নতুন পাসওয়ার্ড (ঐচ্ছিক - পরিবর্তন না চাইলে খালি রাখুন)</label>
                    <input type="password" name="password" class="form-ctrl" placeholder="পরিবর্তন করতে চাইলে লিখুন" autocomplete="new-password">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeEditModal()">বাতিল</button>
                <button type="submit" class="btn btn-primary">সংরক্ষণ করুন</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: Reset Password -->
<div class="modal-backdrop" id="resetPasswordModal">
    <div class="modal-box" style="max-width: 420px;">
        <form method="POST" id="resetPasswordForm" action="">
            @csrf
            <div class="modal-header">
                <div style="font-size: 16px; font-weight: 700; color: #fff;">🔑 পাসওয়ার্ড রিসেট: <span id="resetModalUsername" style="color: var(--accent-cyan);"></span></div>
                <button type="button" onclick="closeResetPasswordModal()" style="background: none; border: none; color: #9ca3af; font-size: 18px; cursor: pointer;">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>নতুন পাসওয়ার্ড (New Password) *</label>
                    <input type="password" name="password" class="form-ctrl" placeholder="নতুন পাসওয়ার্ড লিখুন" required autocomplete="new-password">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeResetPasswordModal()">বাতিল</button>
                <button type="submit" class="btn btn-primary">পাসওয়ার্ড পরিবর্তন করুন</button>
            </div>
        </form>
    </div>
</div>
@endsection

@section('scripts')
<script>
    function openCreateModal() {
        document.getElementById('createUserModal').style.display = 'flex';
    }
    function closeCreateModal() {
        document.getElementById('createUserModal').style.display = 'none';
    }

    function openEditModal(user) {
        document.getElementById('editModalUsername').innerText = '@' + user.username;
        document.getElementById('editDisplayName').value = user.display_name || '';
        document.getElementById('editBoundPhone').value = user.bound_phone || '';
        document.getElementById('editRole').value = user.role || 'user';
        document.getElementById('editPlan').value = user.assigned_plan_id || 'free';
        document.getElementById('editStatus').value = user.status || 'active';
        
        document.getElementById('editUserForm').action = '/admin/users/' + user.id + '/update';
        document.getElementById('editUserModal').style.display = 'flex';
    }
    function closeEditModal() {
        document.getElementById('editUserModal').style.display = 'none';
    }

    function openResetPasswordModal(id, username) {
        document.getElementById('resetModalUsername').innerText = '@' + username;
        document.getElementById('resetPasswordForm').action = '/admin/users/' + id + '/reset-password';
        document.getElementById('resetPasswordModal').style.display = 'flex';
    }
    function closeResetPasswordModal() {
        document.getElementById('resetPasswordModal').style.display = 'none';
    }

    // Modal click outside to close
    window.onclick = function(e) {
        if (e.target.classList.contains('modal-backdrop')) {
            e.target.style.display = 'none';
        }
    };
</script>
@endsection
