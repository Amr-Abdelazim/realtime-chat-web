import { Users } from 'lucide-react';
import { getInitials } from '../lib/utils';

type AvatarProps = {
  name?: string | null;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  group?: boolean;
  online?: boolean;
  className?: string;
};

export function Avatar({ name, src, size = 'md', group = false, online, className = '' }: AvatarProps) {
  return (
    <span className={`avatar avatar-${size} ${group ? 'avatar-group' : ''} ${className}`}>
      {src ? <img src={src} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : group ? <Users size={size === 'sm' ? 15 : 19} /> : <span>{getInitials(name)}</span>}
      {online !== undefined && <i className={`avatar-presence ${online ? 'is-online' : ''}`} />}
    </span>
  );
}
