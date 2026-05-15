import { Mongo } from 'meteor/mongo';

export const LeaderboardCollection = new Mongo.Collection('leaderboard');
import React from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { LeaderboardCollection } from '../api/leaderboard';

export const Leaderboard = ({ roundId }) => {
    const leaderboard = useTracker(() => {
        const sub = Meteor.subscribe('leaderboard');

        if (!sub.ready() || !roundId) {
            return [];
        }

        return LeaderboardCollection.find(
            { roundId },
            {
                sort: {
                    lives: -1,
                    completedAt: 1,
                },
            }
        ).fetch();
    }, [roundId]);

    return (
        <div
            style={{
                marginTop: '26px',
                width: '340px',
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '14px',
                padding: '18px',
                color: 'white',
                boxShadow: '0 0 30px rgba(0,170,255,0.25)',
            }}
        >
            <h2 style={{ textAlign: 'center', marginBottom: '14px', letterSpacing: '2px' }}>
                LEADERBOARD
            </h2>

            {leaderboard.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#ccc' }}>
                    Waiting for players to finish...
                </p>
            ) : (
                leaderboard.map((entry, index) => (
                    <div
                        key={entry._id}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '10px 0',
                            borderBottom: index === leaderboard.length - 1
                                ? 'none'
                                : '1px solid rgba(255,255,255,0.15)',
                        }}
                    >
                        <span>#{index + 1} {entry.name}</span>
                        <span style={{ color: '#ffd369' }}>Lives: {entry.lives}</span>
                    </div>
                ))
            )}
        </div>
    );
};