<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserEmotionalProfile extends Model
{
    protected $table = 'user_emotional_profiles';

    protected $fillable = [
        'user_id',
        'personality_traits',
        'relationship_bond_level',
        'current_mood',
        'intimacy_nickname',
        'known_contacts',
        'past_problems_summary',
        'total_conversations_count',
        'last_interaction_at',
    ];

    protected $casts = [
        'personality_traits' => 'array',
        'known_contacts' => 'array',
        'relationship_bond_level' => 'integer',
        'total_conversations_count' => 'integer',
        'last_interaction_at' => 'datetime',
    ];

    public static function getOrCreateProfile(string $userId, string $name = 'বন্ধু'): self
    {
        return self::firstOrCreate(
            ['user_id' => $userId],
            [
                'personality_traits' => [
                    'temperament' => 'caring and thoughtful',
                    'communication_style' => 'friendly and expressive',
                    'values' => ['friendship', 'loyalty', 'empathy'],
                    'favorite_topics' => ['life', 'work', 'relationships'],
                ],
                'relationship_bond_level' => 30,
                'current_mood' => 'happy',
                'intimacy_nickname' => $name,
                'known_contacts' => [],
                'past_problems_summary' => '',
                'total_conversations_count' => 0,
                'last_interaction_at' => now(),
            ]
        );
    }
}
