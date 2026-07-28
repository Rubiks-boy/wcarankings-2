type IconName = "arrow" | "search" | "select";

type IconProps = {
  name: IconName;
  direction?: "up" | "down";
};

export function Icon({ name, direction = "down" }: IconProps) {
  if (name === "arrow") {
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

  if (name === "search") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="10.75"
          cy="10.75"
          r="5.75"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M15 15L20 20"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M7 10L12 15L17 10"
        stroke="#000000"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

