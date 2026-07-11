// Generated initials avatar — user accounts v1 ships no file upload (D2),
// so every avatar is initials on a deterministic accent color derived from
// the user id. Same id → same color, forever, across devices.

// The 5 bright accents from VISUAL-DESIGN.md §3. Ink text passes AA on
// yellow/lime/teal; cream text on pink/red (contrast notes in §3).
const AVATAR_COLORS = [
  { bg: "#E94B6E", fg: "#FAF6EC" }, // pink
  { bg: "#F4C536", fg: "#1A1612" }, // yellow
  { bg: "#3FB3B3", fg: "#1A1612" }, // teal
  { bg: "#D9402B", fg: "#FAF6EC" }, // red
  { bg: "#92C44F", fg: "#1A1612" }, // lime
] as const;

export function avatarColor(userId: string): (typeof AVATAR_COLORS)[number] {
  // djb2-ish fold of the uuid — stable, dependency-free.
  let hash = 5381;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) + hash + userId.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

export function initialsFrom(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const firstWord = words[0];
  if (!firstWord) return "?";
  const lastWord = words.length > 1 ? words[words.length - 1] : undefined;
  // Array.from respects surrogate pairs so emoji-leading names don't split
  // into broken half-characters.
  const first = Array.from(firstWord)[0] ?? "?";
  const second = lastWord ? (Array.from(lastWord)[0] ?? "") : "";
  return (first + second).toUpperCase();
}

interface InitialsAvatarProps {
  userId: string;
  displayName: string;
  /** Pixel size of the square avatar. Default 32 (header). */
  size?: number;
}

export function InitialsAvatar({ userId, displayName, size = 32 }: InitialsAvatarProps) {
  const { bg, fg } = avatarColor(userId);
  return (
    <span
      aria-hidden="true"
      className="inline-flex select-none items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        color: fg,
        fontSize: Math.max(14, Math.round(size * 0.42)),
      }}
    >
      {initialsFrom(displayName)}
    </span>
  );
}
