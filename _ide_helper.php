<?php

/**
 * IDE Helper Stubs for FREND Laravel System
 * 
 * Provides clean type definitions and autocomplete for PHP language servers
 * (VS Code, Intelephense, PHPStan, PhpStorm) when viewing this standalone repository.
 */

namespace {
    if (!function_exists('now')) {
        /**
         * @param string|null $tz
         * @return \Carbon\Carbon
         */
        function now($tz = null) {
            return new \Carbon\Carbon();
        }
    }

    if (!function_exists('view')) {
        /**
         * @param string|null $view
         * @param array $data
         * @param array $mergeData
         * @return \Illuminate\Contracts\View\View|\Illuminate\Contracts\View\Factory
         */
        function view($view = null, $data = [], $mergeData = []) {
            return new \Illuminate\Contracts\View\View();
        }
    }

    if (!function_exists('response')) {
        /**
         * @param mixed $content
         * @param int $status
         * @param array $headers
         * @return \Illuminate\Routing\ResponseFactory|\Illuminate\Http\Response|\Illuminate\Http\JsonResponse
         */
        function response($content = '', $status = 200, array $headers = []) {
            return new \Illuminate\Routing\ResponseFactory();
        }
    }

    if (!function_exists('redirect')) {
        /**
         * @param string|null $to
         * @param int $status
         * @param array $headers
         * @param bool|null $secure
         * @return \Illuminate\Routing\Redirector|\Illuminate\Http\RedirectResponse
         */
        function redirect($to = null, $status = 302, $headers = [], $secure = null) {
            if ($to === null) {
                return new \Illuminate\Routing\Redirector();
            }
            return new \Illuminate\Http\RedirectResponse();
        }
    }

    if (!function_exists('database_path')) {
        /**
         * @param string $path
         * @return string
         */
        function database_path($path = '') {
            return $path;
        }
    }

    if (!function_exists('base_path')) {
        /**
         * @param string $path
         * @return string
         */
        function base_path($path = '') {
            return $path;
        }
    }
}

namespace Illuminate\Contracts\View {
    class View {}
    class Factory {}
}

namespace Illuminate\Http {
    class Response {}
    class JsonResponse {}
    class RedirectResponse {
        public function with($key, $value = null): self { return $this; }
    }
    class Request {
        public function input($key = null, $default = null) { return $default; }
        public function query($key = null, $default = null) { return $default; }
        public function boolean($key = null, $default = false): bool { return (bool)$default; }
        public function validate(array $rules, array $messages = [], array $attributes = []): array { return []; }
    }
}

namespace Illuminate\Http\Client {
    class Response {
        public function successful(): bool { return true; }
        public function json($key = null, $default = null) { return []; }
    }
    class PendingRequest {
        public function post(string $url, array $data = []): Response { return new Response(); }
        public function get(string $url, $query = null): Response { return new Response(); }
    }
}

namespace Illuminate\Routing {
    class Redirector {
        /**
         * @param int $status
         * @param array $headers
         * @param mixed $fallback
         * @return \Illuminate\Http\RedirectResponse
         */
        public function back($status = 302, $headers = [], $fallback = false) {
            return new \Illuminate\Http\RedirectResponse();
        }

        /**
         * @param string $to
         * @param int $status
         * @param array $headers
         * @param bool|null $secure
         * @return \Illuminate\Http\RedirectResponse
         */
        public function to($to, $status = 302, $headers = [], $secure = null) {
            return new \Illuminate\Http\RedirectResponse();
        }
    }

    class ResponseFactory {
        /**
         * @param mixed $data
         * @param int $status
         * @param array $headers
         * @param int $options
         * @return \Illuminate\Http\JsonResponse
         */
        public function json($data = [], $status = 200, array $headers = [], $options = 0) {
            return new \Illuminate\Http\JsonResponse();
        }
    }

    class RouteRegistrar {
        public function prefix(string $prefix): self { return $this; }
        public function name(string $name): self { return $this; }
        public function middleware($middleware): self { return $this; }
        public function group($callback): void {}
    }

    class Route {
        public function name(string $name): self { return $this; }
    }
}

namespace Illuminate\Database {
    interface ConnectionInterface {}
}

namespace Illuminate\Database\Query {
    class Builder {
        public function count($columns = '*'): int { return 0; }
    }
}

namespace Illuminate\Database\Eloquent {
    class Builder {
        public function where($column, $operator = null, $value = null, $boolean = 'and'): self { return $this; }
        public function orWhere($column, $operator = null, $value = null): self { return $this; }
        public function orderBy(string $column, string $direction = 'asc'): self { return $this; }
        public function latest(?string $column = null): self { return $this; }
        public function count($columns = '*'): int { return 0; }
        public function paginate(int $perPage = 15, array $columns = ['*'], string $pageName = 'page', ?int $page = null) { return new \Illuminate\Pagination\LengthAwarePaginator(); }
        public function first($columns = ['*']) { return null; }
        public function find($id, array $columns = ['*']) { return null; }
        public function findOrFail($id, array $columns = ['*']) { return null; }
        public function get(array $columns = ['*']): array { return []; }
        public function due(): self { return $this; }
        public function pending(): self { return $this; }
        public function search(?string $keyword): self { return $this; }
        public function forUser(string $userId): self { return $this; }
    }

    abstract class Model {
        /** @var int|string */
        public $id;
        /** @var \Carbon\Carbon|null */
        public $created_at;
        /** @var \Carbon\Carbon|null */
        public $updated_at;

        public function save(array $options = []): bool { return true; }
        public function update(array $attributes = [], array $options = []): bool { return true; }
        public function delete(): ?bool { return true; }
        public static function query(): \Illuminate\Database\Eloquent\Builder { return new \Illuminate\Database\Eloquent\Builder(); }
        public static function find($id, $columns = null) { return null; }
        public static function findOrFail($id, $columns = null) { return null; }
        public static function count($columns = '*'): int { return 0; }
        public static function create(array $attributes = []) { return null; }
        public static function firstOrCreate(array $attributes = [], array $values = []) { return null; }
        public static function updateOrCreate(array $attributes, array $values = []) { return null; }
        public static function latest($column = null): \Illuminate\Database\Eloquent\Builder { return new \Illuminate\Database\Eloquent\Builder(); }
        public static function orderBy(string $column, string $direction = 'asc'): \Illuminate\Database\Eloquent\Builder { return new \Illuminate\Database\Eloquent\Builder(); }
        public static function where($column, $operator = null, $value = null, $boolean = 'and'): \Illuminate\Database\Eloquent\Builder { return new \Illuminate\Database\Eloquent\Builder(); }
        public function belongsTo($related, $foreignKey = null, $ownerKey = null, $relation = null) {}
        public function hasOne($related, $foreignKey = null, $localKey = null) {}
        public function hasMany($related, $foreignKey = null, $localKey = null) {}
    }
}

namespace Illuminate\Pagination {
    class LengthAwarePaginator {
        public function total(): int { return 0; }
        public function count(): int { return 0; }
        public function links(?string $view = null, array $data = []): string { return ''; }
    }
}

namespace Illuminate\Support\Facades {
    class DB {
        /**
         * @param string|null $name
         * @return \Illuminate\Database\ConnectionInterface
         */
        public static function connection(?string $name = null) { return new class implements \Illuminate\Database\ConnectionInterface {}; }
        public static function getPdo(): \PDO { return new \PDO('sqlite::memory:'); }
        public static function getDatabaseName(): string { return 'frend'; }
        public static function select(string $query, array $bindings = [], bool $useReadPdo = true): array { return []; }
        public static function unprepared(string $query): bool { return true; }
        public static function table(string $table, ?string $as = null): \Illuminate\Database\Query\Builder { return new \Illuminate\Database\Query\Builder(); }
    }

    class Artisan {
        public static function call(string $command, array $parameters = []): int { return 0; }
        public static function output(): string { return ''; }
    }

    class File {
        public static function exists(string $path): bool { return true; }
        public static function get(string $path, bool $lock = false): string { return ''; }
    }

    class Http {
        public static function timeout(int $seconds): \Illuminate\Http\Client\PendingRequest { return new \Illuminate\Http\Client\PendingRequest(); }
        public static function post(string $url, array $data = []): \Illuminate\Http\Client\Response { return new \Illuminate\Http\Client\Response(); }
        public static function get(string $url, $query = null): \Illuminate\Http\Client\Response { return new \Illuminate\Http\Client\Response(); }
    }

    class Schema {
        public static function hasTable(string $table): bool { return true; }
        public static function create(string $table, \Closure $callback): void {}
        public static function dropIfExists(string $table): void {}
    }

    class Route {
        public static function prefix(string $prefix): \Illuminate\Routing\RouteRegistrar { return new \Illuminate\Routing\RouteRegistrar(); }
        public static function name(string $name): \Illuminate\Routing\RouteRegistrar { return new \Illuminate\Routing\RouteRegistrar(); }
        public static function middleware($middleware): \Illuminate\Routing\RouteRegistrar { return new \Illuminate\Routing\RouteRegistrar(); }
        public static function get(string $uri, $action = null): \Illuminate\Routing\Route { return new \Illuminate\Routing\Route(); }
        public static function post(string $uri, $action = null): \Illuminate\Routing\Route { return new \Illuminate\Routing\Route(); }
        public static function delete(string $uri, $action = null): \Illuminate\Routing\Route { return new \Illuminate\Routing\Route(); }
        public static function group($routes, ?\Closure $callback = null): void {}
    }
}

namespace Illuminate\Database\Eloquent\Factories {
    trait HasFactory {}
}

namespace Illuminate\Database\Migrations {
    abstract class Migration {}
}

namespace Illuminate\Database\Schema {
    class Blueprint {
        public function id(string $column = 'id') {}
        public function string(string $column, ?int $length = null) {}
        public function text(string $column) {}
        public function longText(string $column) {}
        public function dateTime(string $column, int $precision = 0) {}
        public function timestamp(string $column, int $precision = 0) {}
        public function timestamps(int $precision = 0) {}
        public function enum(string $column, array $allowed) {}
        public function boolean(string $column) {}
        public function integer(string $column, bool $autoIncrement = false, bool $unsigned = false) {}
        public function unsignedInteger(string $column, bool $autoIncrement = false) {}
        public function decimal(string $column, int $total = 8, int $places = 2) {}
        public function date(string $column) {}
        public function unique($columns, ?string $name = null, ?string $algorithm = null) {}
        public function nullable(): self { return $this; }
        public function default($value): self { return $this; }
        public function index(?string $name = null): self { return $this; }
        public function comment(string $comment): self { return $this; }
        public function useCurrent(): self { return $this; }
        public function useCurrentOnUpdate(): self { return $this; }
    }
}

namespace Carbon {
    class Carbon {
        public static function now($tz = null): self { return new self(); }
        public static function today($tz = null): self { return new self(); }
        public static function yesterday($tz = null): self { return new self(); }
        public static function parse($time = null, $tz = null): self { return new self(); }
        public function addMinutes(int $value): self { return $this; }
        public function format(string $format): string { return ''; }
        public function toDateString(): string { return ''; }
        public function toIso8601String(): string { return ''; }
        public function equalTo($date): bool { return false; }
        public function isPast(): bool { return false; }
    }
}
