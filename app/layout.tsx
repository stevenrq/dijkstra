import type { Metadata, Viewport } from "next";
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Condensed,
} from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

// IBM Plex: cara de instrumento tecnico, con cifras tabulares reales.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// La condensada es solo para los rotulos del mapa: es lo que hace la
// cartografia real para que las etiquetas quepan sin chocar entre si.
const plexCondensed = IBM_Plex_Sans_Condensed({
  variable: "--font-plex-condensed",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  display: "swap",
});

// La monoespaciada se reserva para las formulas de relajacion.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "RutaÓptima — Dijkstra aplicado a logística de distribución",
    template: "%s · RutaÓptima",
  },
  description:
    "Aplicación interactiva que resuelve la ruta de distribución de menor costo sobre la red vial de Colombia con el algoritmo de Dijkstra, con editor de grafos y ejecución paso a paso.",
  applicationName: "RutaÓptima",
  authors: [{ name: "Teoría de Grafos" }],
  keywords: [
    "Dijkstra",
    "teoría de grafos",
    "ruta mínima",
    "logística",
    "camino más corto",
    "Colombia",
  ],
  openGraph: {
    title: "RutaÓptima — Dijkstra aplicado a logística de distribución",
    description:
      "Escoge nodos, define aristas y observa cómo Dijkstra encuentra la ruta de menor costo, distancia o tiempo, paso a paso.",
    locale: "es_CO",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Se ejecuta antes de pintar para evitar el parpadeo de tema claro en modo oscuro.
const scriptTema = `(function(){try{var t=localStorage.getItem("rutaoptima-tema");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${plexSans.variable} ${plexCondensed.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <Toaster>{children}</Toaster>
        </TooltipProvider>
      </body>
    </html>
  );
}
