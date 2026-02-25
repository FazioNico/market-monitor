export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                ink: {
                    950: "#060910",
                    900: "#0a1020",
                    800: "#111a31",
                },
                steel: {
                    200: "#c4d0e7",
                    300: "#9ab0d3",
                    400: "#6f8fc0",
                    500: "#4e70a1",
                },
                cyan: {
                    300: "#7be7ff",
                    400: "#36d8ff",
                    500: "#00b8f5",
                },
                gold: {
                    300: "#f2d389",
                    400: "#d8b15f",
                    500: "#a88439",
                },
            },
            fontFamily: {
                sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
                display: ["Space Grotesk", "IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
                mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
            },
            boxShadow: {
                panel: "0 10px 40px rgba(0,0,0,0.35)",
                glow: "0 0 0 1px rgba(123,231,255,0.14), 0 12px 40px rgba(0,184,245,0.08)",
            },
            backgroundImage: {
                "grid-fine": "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
            },
            backgroundSize: {
                "grid-fine": "28px 28px",
            },
            keyframes: {
                sweep: {
                    "0%": { transform: "translateX(-120%)" },
                    "100%": { transform: "translateX(120%)" },
                },
            },
            animation: {
                sweep: "sweep 2.4s linear infinite",
            },
        },
    },
    plugins: [],
};
