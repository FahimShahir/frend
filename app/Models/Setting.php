<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property string $key
 * @property string|null $value
 * @property string|null $description
 * @method static Setting|null find(string $id, array|null $columns = null)
 * @method static Setting updateOrCreate(array $attributes, array $values = [])
 */
class Setting extends Model
{
    protected $table = 'system_settings';
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'key',
        'value',
        'description',
    ];

    /**
     * Get setting value by key
     * @param string $key
     * @param mixed $default
     * @return mixed
     */
    public static function get(string $key, $default = null)
    {
        $setting = static::find($key);
        return $setting ? $setting->value : $default;
    }

    /**
     * Set setting value by key
     * @param string $key
     * @param mixed $value
     * @param string|null $description
     * @return self
     */
    public static function set(string $key, $value, ?string $description = null): self
    {
        return static::updateOrCreate(
            ['key' => $key],
            [
                'value' => (string)$value,
                'description' => $description ?? $key,
            ]
        );
    }
}
