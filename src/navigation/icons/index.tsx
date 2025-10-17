import { ComponentType } from 'react';

type IconProps = { className?: string };

type IconComponent = ComponentType<IconProps>;

function wrap(path: string, viewBox = '0 0 24 24'): IconComponent {
  return function Icon({ className }: IconProps) {
    return (
      <svg className={className} viewBox={viewBox} aria-hidden="true" focusable="false">
        <path d={path} fill="currentColor" />
      </svg>
    );
  };
}

export const DashboardIcon = wrap('M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8v-10h-8v10zm0-18v6h8V3h-8z');
export const SettingsIcon = wrap('M19.14 12.936a7.5 7.5 0 000-1.872l2.03-1.58a.5.5 0 00.12-.638l-1.92-3.318a.5.5 0 00-.607-.22l-2.39.96a7.42 7.42 0 00-1.62-.936l-.36-2.54a.5.5 0 00-.496-.436h-3.84a.5.5 0 00-.496.436l-.36 2.54a7.42 7.42 0 00-1.62.936l-2.39-.96a.5.5 0 00-.607.22L2.71 8.846a.5.5 0 00.12.638l2.03 1.58a7.5 7.5 0 000 1.872l-2.03 1.58a.5.5 0 00-.12.638l1.92 3.318a.5.5 0 00.607.22l2.39-.96a7.42 7.42 0 001.62.936l.36 2.54a.5.5 0 00.496.436h3.84a.5.5 0 00.496-.436l.36-2.54a7.42 7.42 0 001.62-.936l2.39.96a.5.5 0 00.607-.22l1.92-3.318a.5.5 0 00-.12-.638l-2.03-1.58zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z');
export const CalendarIcon = wrap('M7 2v2H5a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2V2h-2v2H9V2H7zm10 7H7v8h10z');
export const UsersIcon = wrap('M16 11c1.933 0 3.5-1.79 3.5-4S17.933 3 16 3s-3.5 1.79-3.5 4 1.567 4 3.5 4zm-8 0c1.933 0 3.5-1.79 3.5-4S9.933 3 8 3 4.5 4.79 4.5 7 6.067 11 8 11zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05A4.55 4.55 0 0120 17.5V20h4v-3.5c0-2.33-4.67-3.5-8-3.5z');
export const BadgeIcon = wrap('M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z');
export const UploadIcon = wrap('M12 3l-5 5h3v6h4V8h3zm-7 12v4h14v-4h2v4a2 2 0 01-2 2H7a2 2 0 01-2-2v-4h2z');
export const LinkIcon = wrap('M10.59 13.41a1 1 0 010-1.414l1-1a4 4 0 015.657 5.657l-2.121 2.121a4 4 0 01-5.657 0 1 1 0 011.414-1.414 2 2 0 002.829 0l2.121-2.121a2 2 0 10-2.829-2.829l-1 1a1 1 0 01-1.414 0zm-7.07 7.07a4 4 0 010-5.657L5.64 12.7a4 4 0 015.657 0 1 1 0 01-1.414 1.414 2 2 0 00-2.829 0l-2.121 2.121a2 2 0 102.829 2.829l1-1a1 1 0 011.414 1.414l-1 1a4 4 0 01-5.657 0z');
export const ProfileIcon = wrap('M12 12a5 5 0 10-5-5 5 5 0 005 5zm-7 9a7 7 0 0114 0 1 1 0 01-1 1H6a1 1 0 01-1-1z');
export const PeopleIcon = UsersIcon;
