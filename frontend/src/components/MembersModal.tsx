import RoomMembersList from './RoomMembersList';
import type { RoomMember } from '../hooks/useWebSocket';

interface MembersModalProps {
  roomCode: string;
  members: RoomMember[];
  onClose: () => void;
}

export default function MembersModal({ roomCode, members, onClose }: MembersModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-4 mb-6 sm:mb-0 rounded-xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <RoomMembersList roomCode={roomCode} members={members} />
      </div>
    </div>
  );
}
