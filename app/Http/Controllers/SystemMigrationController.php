<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Exception;

/**
 * Web-Based Database Migration & System Setup Controller
 * 
 * cPanel শেয়ার্ড হোস্টিংয়ে SSH/Terminal এক্সেস না থাকলেও অ্যাডমিন যেন
 * সরাসরি ব্রাউজার থেকে ১-ক্লিকে:
 * ১. মাইগ্রেশন রান করতে পারে (php artisan migrate --force)
 * ২. ডিফল্ট ডাম্প SQL ফাইল ইমপোর্ট করতে পারে
 * ৩. টেবিল স্ট্যাটাস ও ডেটাবেস সংযোগ পরীক্ষা করতে পারে
 * ৪. ক্যাশ পরিষ্কার ও সিস্টেম অপটিমাইজ করতে পারে
 */
class SystemMigrationController extends Controller
{
    /**
     * মাইগ্রেশন ও ডেটাবেস কন্ট্রোল প্যানেল পেজ
     */
    public function index()
    {
        $dbConnected = false;
        $dbError = null;
        $tables = [];
        $migrationStatus = '';

        try {
            DB::connection()->getPdo();
            $dbConnected = true;

            // Get all MySQL tables
            $dbName = DB::connection()->getDatabaseName();
            $rawTables = DB::select('SHOW TABLES');
            $tableKey = "Tables_in_{$dbName}";

            foreach ($rawTables as $t) {
                $tableName = $t->$tableKey ?? current((array)$t);
                $count = 0;
                try {
                    $count = DB::table($tableName)->count();
                } catch (Exception $e) {}

                $tables[] = [
                    'name' => $tableName,
                    'rows' => $count,
                ];
            }

            // Check Artisan migration status output
            try {
                Artisan::call('migrate:status');
                $migrationStatus = Artisan::output();
            } catch (Exception $e) {
                $migrationStatus = 'স্ট্যাটাস চেক করা যায়নি: ' . $e->getMessage();
            }

        } catch (Exception $e) {
            $dbConnected = false;
            $dbError = $e->getMessage();
        }

        return view('admin.migrations', compact('dbConnected', 'dbError', 'tables', 'migrationStatus'));
    }

    /**
     * ব্রাউজার থেকে এক ক্লিকে মাইগ্রেশন রান করা
     */
    public function runMigrations(Request $request)
    {
        try {
            // Run php artisan migrate --force
            $exitCode = Artisan::call('migrate', [
                '--force' => true,
            ]);

            $output = Artisan::output();

            return response()->json([
                'success' => $exitCode === 0,
                'message' => $exitCode === 0 ? '✅ মাইগ্রেশন সফলভাবে সম্পন্ন হয়েছে!' : '⚠️ মাইগ্রেশনে সমস্যা হয়েছে।',
                'output' => $output,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'মাইগ্রেশন ব্যর্থ হয়েছে: ' . $e->getMessage(),
                'output' => $e->getTraceAsString(),
            ], 500);
        }
    }

    /**
     * সরাসরি SQL ফাইল ইমপোর্ট করা (phpMyAdmin ছাড়াও সরাসরি ব্রাউজার থেকে)
     */
    public function importSqlFile(Request $request)
    {
        try {
            $sqlPath = database_path('frend_complete_mysql.sql');
            if (!File::exists($sqlPath)) {
                // Check alternative location
                $altPath = base_path('database/frend_complete_mysql.sql');
                if (File::exists($altPath)) {
                    $sqlPath = $altPath;
                } else {
                    return response()->json([
                        'success' => false,
                        'message' => 'frend_complete_mysql.sql ফাইলটি database/ ফোল্ডারে পাওয়া যায়নি।',
                    ], 404);
                }
            }

            $sqlContent = File::get($sqlPath);
            DB::unprepared($sqlContent);

            return response()->json([
                'success' => true,
                'message' => '🎉 frend_complete_mysql.sql সফলভাবে ডেটাবেসে ইমপোর্ট সম্পন্ন হয়েছে!',
                'output' => 'সকল টেবিল এবং ডিফল্ট সিড ডেটা সফলভাবে তৈরি হয়েছে।',
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'SQL ইমপোর্টে সমস্যা: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * সিস্টেম ক্যাশ ও কনফিগ ক্লিয়ার করা (optimize:clear)
     */
    public function clearCache(Request $request)
    {
        try {
            Artisan::call('optimize:clear');
            $output = Artisan::output();

            return response()->json([
                'success' => true,
                'message' => '⚡ সিস্টেম ক্যাশ ও কনফিগ সফলভাবে পরিষ্কার করা হয়েছে!',
                'output' => $output,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'ক্যাশ ক্লিয়ার করতে সমস্যা: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * মাইগ্রেশন রোলব্যাক করা (যদি প্রয়োজন হয়)
     */
    public function rollbackMigrations(Request $request)
    {
        try {
            $exitCode = Artisan::call('migrate:rollback', [
                '--force' => true,
            ]);

            $output = Artisan::output();

            return response()->json([
                'success' => $exitCode === 0,
                'message' => 'মাইগ্রেশন রোলব্যাক সম্পন্ন।',
                'output' => $output,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'রোলব্যাক করতে সমস্যা: ' . $e->getMessage(),
            ], 500);
        }
    }
}
