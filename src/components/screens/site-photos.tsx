"use client";

/**
 * As fotos do serviço, com clique que abre e navegação para o lado.
 *
 * Antes cada miniatura era um `<a target="_blank">` para o arquivo cru no
 * storage: o parceiro clicava e caía numa aba com UMA foto pelada, sem próxima
 * nem voltar, e para ver a segunda tinha que fechar a aba e clicar de novo. Foi
 * a reclamação deles em 27/08/2026, e o e-mail de convite já tinha sido
 * consertado; o portal não.
 *
 * Aqui a foto abre por cima da tela e anda para o lado: seta do teclado, botão,
 * e arrasto com o dedo — que é como quase todo parceiro abre isto, no celular a
 * caminho do job.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { T } from "@/lib/tokens";

/** Distância mínima do arrasto para contar como "próxima". Abaixo disso é toque trêmulo. */
const ARRASTO_MINIMO = 40;

export function SitePhotos({ images }: { images: string[] }) {
  const [aberta, setAberta] = useState<number | null>(null);
  const toqueX = useRef<number | null>(null);

  const fechar = useCallback(() => setAberta(null), []);
  const andar = useCallback(
    (passo: number) => {
      setAberta((i) => (i === null ? null : (i + passo + images.length) % images.length));
    },
    [images.length],
  );

  /**
   * Teclado só enquanto a foto está aberta, e `preventDefault` nas setas para a
   * página atrás não rolar junto.
   */
  useEffect(() => {
    if (aberta === null) return;
    const naTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
      else if (e.key === "ArrowRight") { e.preventDefault(); andar(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); andar(-1); }
    };
    window.addEventListener("keydown", naTecla);
    // A página atrás não rola enquanto a foto está por cima.
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", naTecla);
      document.body.style.overflow = rolagem;
    };
  }, [aberta, fechar, andar]);

  if (images.length === 0) return null;

  const seta = (lado: "left" | "right"): React.CSSProperties => ({
    position: "absolute",
    [lado]: 8,
    top: "50%",
    transform: "translateY(-50%)",
    width: 44,
    height: 44,
    borderRadius: 999,
    border: "none",
    background: "rgba(255,255,255,0.16)",
    color: T.white,
    fontSize: 22,
    lineHeight: "44px",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
  });

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        {images.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setAberta(i)}
            aria-label={`Open site photo ${i + 1} of ${images.length}`}
            style={{
              display: "block",
              padding: 0,
              borderRadius: 10,
              overflow: "hidden",
              border: `1px solid ${T.line}`,
              background: T.paper,
              cursor: "zoom-in",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Site photo ${i + 1}`}
              style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }}
            />
          </button>
        ))}
      </div>

      {aberta !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Site photo ${aberta + 1} of ${images.length}`}
          onClick={fechar}
          onTouchStart={(e) => { toqueX.current = e.touches[0]?.clientX ?? null; }}
          onTouchEnd={(e) => {
            const inicio = toqueX.current;
            toqueX.current = null;
            if (inicio === null) return;
            const dx = (e.changedTouches[0]?.clientX ?? inicio) - inicio;
            if (Math.abs(dx) >= ARRASTO_MINIMO) andar(dx < 0 ? 1 : -1);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(2,0,64,0.92)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          {/* O clique na própria foto não fecha: só o fundo fecha. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[aberta]}
            alt={`Site photo ${aberta + 1} of ${images.length}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "82vh",
              objectFit: "contain",
              borderRadius: 12,
              display: "block",
            }}
          />

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); fechar(); }}
            aria-label="Close photo"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 40,
              height: 40,
              borderRadius: 999,
              border: "none",
              background: "rgba(255,255,255,0.16)",
              color: T.white,
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ×
          </button>

          {images.length > 1 ? (
            <>
              <button type="button" aria-label="Previous photo" style={seta("left")}
                onClick={(e) => { e.stopPropagation(); andar(-1); }}>‹</button>
              <button type="button" aria-label="Next photo" style={seta("right")}
                onClick={(e) => { e.stopPropagation(); andar(1); }}>›</button>
              <div
                style={{
                  position: "absolute",
                  bottom: 18,
                  left: "50%",
                  transform: "translateX(-50%)",
                  color: T.white,
                  font: `500 12px/1 ${T.mono}`,
                  letterSpacing: "0.08em",
                  background: "rgba(255,255,255,0.14)",
                  padding: "7px 12px",
                  borderRadius: 999,
                }}
              >
                {aberta + 1} / {images.length}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
