import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export async function GET() {
  const [display, body] = await Promise.all([
    readFile(
      path.join(process.cwd(), "src/assets/fonts/Fraunces-SemiBold.ttf"),
    ),
    readFile(
      path.join(process.cwd(), "src/assets/fonts/IBMPlexMono-Medium.ttf"),
    ),
  ]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#f4efe3",
        color: "#211d16",
        padding: "60px",
        gap: 60,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontFamily: "Fraunces", fontSize: 42, display: "flex" }}>
          Factura<span style={{ color: "#d9480f" }}>.</span>
        </div>
        <div style={{ fontFamily: "Fraunces", fontSize: 65, lineHeight: 1.08 }}>
          Recibo de alquiler para completar e imprimir
        </div>
        <div style={{ fontFamily: "Plex", fontSize: 21, color: "#d9480f" }}>
          PDF gratis · Sin cuenta
        </div>
      </div>
      <div
        style={{
          width: 350,
          display: "flex",
          flexDirection: "column",
          background: "white",
          border: "1px solid #ddd2bb",
          padding: "32px",
          gap: 22,
        }}
      >
        <div style={{ fontFamily: "Fraunces", fontSize: 33 }}>
          Recibo de alquiler
        </div>
        <div style={{ fontFamily: "Plex", fontSize: 14 }}>
          Fecha: ____ / ____ / ______
        </div>
        <div style={{ height: 1, background: "#ddd2bb" }} />
        <div style={{ fontFamily: "Plex", fontSize: 14 }}>Importe recibido</div>
        <div style={{ fontFamily: "Fraunces", fontSize: 32 }}>
          $ ______________
        </div>
        <div style={{ fontFamily: "Plex", fontSize: 14 }}>
          Período: ______________
        </div>
        <div style={{ height: 1, background: "#ddd2bb" }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "Plex",
            fontSize: 14,
            lineHeight: 1.8,
          }}
        >
          <div>Recibí de ______________</div>
          <div>Por el alquiler de ______</div>
          <div>_______________________</div>
        </div>
        <div
          style={{
            marginTop: 30,
            borderTop: "1px solid #211d16",
            paddingTop: 12,
            fontFamily: "Plex",
            fontSize: 12,
          }}
        >
          Firma de quien recibe
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Fraunces", data: display, weight: 600, style: "normal" },
        { name: "Plex", data: body, weight: 500, style: "normal" },
      ],
    },
  );
}
