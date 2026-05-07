import React from 'react';

const COLOUR_STYLES = {
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-400',
};

export const ColourSequence = ({ sequence }) => {
    return (
        <div className="flex gap-4 justify-center my-8">
            {sequence.map((colour, index) => (
                <div
                key={index}
                className={'w-16 h-16 rounded-full ${Colour_STYLES[colour]}'}
                title={colour}
                />
            ))}
        </div>
    );
};