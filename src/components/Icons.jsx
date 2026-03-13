function SvgIcon({ children, className = '', strokeWidth = 1.8, viewBox = '0 0 24 24' }) {
  return (
    <svg
      className={className}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function AtlasIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M7.5 17h9" />
      <path d="M8.5 13.5h7" />
      <path d="M12 8.25a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" />
    </SvgIcon>
  );
}

export function DashboardIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect x="3.5" y="4" width="7.5" height="7.5" rx="2" />
      <rect x="13" y="4" width="7.5" height="5.5" rx="2" />
      <rect x="13" y="11.5" width="7.5" height="8.5" rx="2" />
      <rect x="3.5" y="13.5" width="7.5" height="6.5" rx="2" />
    </SvgIcon>
  );
}

export function TerritoriesIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M4 5.5h16" />
      <path d="M4 12h16" />
      <path d="M4 18.5h16" />
      <path d="M8 4v16" />
      <path d="M16 4v16" />
    </SvgIcon>
  );
}

export function AdminIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3.5v4" />
      <path d="M12 16.5v4" />
      <path d="M4 7.5h6" />
      <path d="M14 16.5h6" />
      <path d="M14 7.5h6" />
      <path d="M4 16.5h6" />
      <circle cx="12" cy="12" r="3.5" />
    </SvgIcon>
  );
}

export function FaqIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.25A2.75 2.75 0 0 1 12 7.75c1.73 0 3 1.03 3 2.63 0 1.2-.65 1.93-1.88 2.67-.95.57-1.37 1.04-1.37 1.95" />
      <circle cx="12" cy="17" r=".65" fill="currentColor" stroke="none" />
    </SvgIcon>
  );
}

export function SearchIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </SvgIcon>
  );
}

export function PlusIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </SvgIcon>
  );
}

export function MinusIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M5 12h14" />
    </SvgIcon>
  );
}

export function LocateIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 2.5v4" />
      <path d="M12 17.5v4" />
      <path d="M2.5 12h4" />
      <path d="M17.5 12h4" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </SvgIcon>
  );
}

export function DrawIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="m4 16 6-9 5 4 5-5" />
      <path d="M4 19h16" />
      <circle cx="10" cy="7" r="1.25" />
      <circle cx="15" cy="11" r="1.25" />
      <circle cx="20" cy="6" r="1.25" />
    </SvgIcon>
  );
}

export function UserIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </SvgIcon>
  );
}

export function LogoutIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M9 4.5H6.5A2.5 2.5 0 0 0 4 7v10a2.5 2.5 0 0 0 2.5 2.5H9" />
      <path d="M14 8.5 19 12l-5 3.5" />
      <path d="M10 12h9" />
    </SvgIcon>
  );
}

export function ChevronDownIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </SvgIcon>
  );
}

export function MapPinIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 20.5s6-5.85 6-10.5a6 6 0 1 0-12 0c0 4.65 6 10.5 6 10.5Z" />
      <circle cx="12" cy="10" r="2.2" />
    </SvgIcon>
  );
}

export function SparklesIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="m12 3 1.3 3.4L17 7.7l-3.7 1.3L12 12.5 10.7 9 7 7.7l3.7-1.3L12 3Z" />
      <path d="m18.5 13 1 2.2 2.5.8-2.5.8-1 2.2-1-2.2-2.5-.8 2.5-.8 1-2.2Z" />
      <path d="m5.5 13 1 2.2 2.5.8-2.5.8-1 2.2-1-2.2-2.5-.8 2.5-.8 1-2.2Z" />
    </SvgIcon>
  );
}

export function CalendarIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M7.5 3.5v3" />
      <path d="M16.5 3.5v3" />
      <path d="M3.5 9.5h17" />
    </SvgIcon>
  );
}

export function ClockIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3 2" />
    </SvgIcon>
  );
}

export function FileIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M7 3.5h7l4 4V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
      <path d="M14 3.5v4h4" />
      <path d="M8 12h8" />
      <path d="M8 16h6" />
    </SvgIcon>
  );
}

export function DownloadIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 4.5v10" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4 19.5h16" />
    </SvgIcon>
  );
}

export function ShieldIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3.5 5.5 6v5.5c0 4.1 2.5 7.1 6.5 9 4-1.9 6.5-4.9 6.5-9V6L12 3.5Z" />
      <path d="m9.2 12 1.9 1.9 3.7-4" />
    </SvgIcon>
  );
}

export function DatabaseIcon(props) {
  return (
    <SvgIcon {...props}>
      <ellipse cx="12" cy="6.5" rx="7.5" ry="3" />
      <path d="M4.5 6.5v5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-5" />
      <path d="M4.5 11.5v5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-5" />
    </SvgIcon>
  );
}

export function BellIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M7 16.5V11a5 5 0 0 1 10 0v5.5l1.75 2H5.25L7 16.5Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </SvgIcon>
  );
}

export function CheckIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </SvgIcon>
  );
}
