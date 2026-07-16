import { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '../config';
import type { RoomMember } from '../hooks/useWebSocket';

interface RoomMembersListProps {
  roomCode: string;
  members: RoomMember[];
}

interface FullMember extends RoomMember {
  online: boolean;
}

export default function RoomMembersList({ roomCode, members: wsMembersProp }: RoomMembersListProps) {
  const [members, setMembers] = useState<FullMember[]>([]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${roomCode}/members`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json() as { members: FullMember[] };
      setMembers(data.members);
    } catch {
      // silently fail — not critical
    }
  }, [roomCode]);

  // Initial fetch
  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  // When WS broadcasts users_updated, merge online status into DB-sourced member list
  useEffect(() => {
    if (!wsMembersProp.length) return;
    const onlineIds = new Set(wsMembersProp.map((m) => m.userId));
    setMembers((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((m) => ({ ...m, online: onlineIds.has(m.userId) }));
    });
    // Also re-fetch to pick up any newly joined members
    void fetchMembers();
  }, [wsMembersProp, fetchMembers]);

  const host = members.filter((m) => m.role === 'host');
  const guests = members.filter((m) => m.role === 'guest');

  return (
    <div className="bg-gray-800 rounded-lg flex flex-col max-h-[calc(100vh-8rem)]">
      <div className="p-4 border-b border-gray-700 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          In this room
        </h3>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
      {members.length === 0 ? (
        <p className="text-gray-500 text-xs text-center py-4">Loading...</p>
      ) : (
        <div className="space-y-4">
          {host.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Host</p>
              <div className="space-y-2">
                {host.map((m) => (
                  <MemberRow key={m.userId} member={m} />
                ))}
              </div>
            </div>
          )}

          {guests.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Guests ({guests.length})</p>
              <div className="space-y-2">
                {guests.map((m) => (
                  <MemberRow key={m.userId} member={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: FullMember }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          member.online ? 'bg-green-400' : 'bg-gray-600'
        }`}
        title={member.online ? 'Online' : 'Offline'}
      />
      <span className="text-sm text-white truncate flex-1">{member.displayName}</span>
    </div>
  );
}
