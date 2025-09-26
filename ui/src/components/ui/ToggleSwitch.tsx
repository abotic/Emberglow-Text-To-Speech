import React from 'react';


interface Props {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    label: string;
    description: string;
}


export const ToggleSwitch: React.FC<Props> = ({ checked, onChange, disabled, label, description }) => (
    <div className="flex items-start space-x-3 p-4 bg-green-900/20 border border-green-800/50 rounded-xl">
        <div className="flex items-center">
            <button
                type="button"
                className={`${checked ? 'bg-green-600' : 'bg-gray-600'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed`}
                role="switch"
                aria-checked={checked}
                onClick={() => !disabled && onChange(!checked)}
                disabled={disabled}
            >
                <span
                    className={`${checked ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                />
            </button>
        </div>
        <div className="flex-1">
            <span className="text-sm font-medium text-green-300">{label}</span>
            <p className="text-xs text-green-200 mt-1">{description}</p>
        </div>
    </div>
);