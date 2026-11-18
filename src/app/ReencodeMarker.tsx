// The bare ⚠️ shown beside a video whose upload has not been re-encoded yet
// (#31): no words, no tooltip, no click — just the aria-label for screen
// readers. Rendered wherever a track name appears on the Practice and Plans
// pages; the server passes the marked IDs down as a string[].
export default function ReencodeMarker() {
  return (
    <span role="img" aria-label="Video not yet re-encoded">
      ⚠️
    </span>
  );
}
