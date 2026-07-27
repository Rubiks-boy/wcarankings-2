export function Arrow({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24"
      viewBox="0 -960 960 960"
      width="24"
      aria-hidden="true"
    >
      <path
        d={
          direction === "up"
            ? "M440-160v-487L216-423l-56-57 320-320 320 320-56 57-224-224v487h-80Z"
            : "M440-800v487L216-537l-56 57 320 320 320-320-56-57-224 224v-487h-80Z"
        }
      />
    </svg>
  );
}
