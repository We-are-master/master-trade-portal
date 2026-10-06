import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { htmlToPlainTextBlocks } from "@/lib/html-to-plain-text";

export interface PartnerContractSignedPdfData {
  companyName: string;
  logoDataUrl?: string;
  contractTitle: string;
  contractVersion: string;
  contractType: string;
  bodyHtml: string;
  signerFullName: string;
  signerEmail: string;
  signedAt: string;
  signerIp: string | null;
  deviceInfo: string | null;
  signatureImageBase64: string;
  contractVersionId: string;
  /** A declaration made with this signature (e.g. Annex 1, the VAT Status Declaration). */
  declarationTitle?: string;
  declarationLines?: string[];
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
    lineHeight: 1.4,
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: {
    width: 28,
    height: 28,
    objectFit: "contain",
  },
  company: {
    fontSize: 8,
    color: "#666",
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: "#020040",
    marginBottom: 4,
  },
  meta: {
    fontSize: 8,
    color: "#666",
  },
  bodyLine: {
    marginBottom: 4,
  },
  signSection: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
  },
  signLabel: {
    fontSize: 8,
    color: "#666",
    marginBottom: 6,
  },
  signatureImage: {
    width: 200,
    height: 60,
    objectFit: "contain",
    marginBottom: 8,
  },
  signerName: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 2,
  },
  declarationBox: {
    marginTop: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 4,
  },
  declarationLine: {
    fontSize: 8.5,
    marginBottom: 4,
  },
  auditBox: {
    marginTop: 16,
    padding: 10,
    backgroundColor: "#f8f8fa",
    borderRadius: 4,
  },
  auditTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: "#020040",
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  auditRow: {
    fontSize: 7.5,
    color: "#444",
    marginBottom: 2,
  },
});

function formatSignedAt(iso: string): string {
  try {
    return new Date(iso).toUTCString();
  } catch {
    return iso;
  }
}

export function PartnerContractSignedPDF({ data }: { data: PartnerContractSignedPdfData }) {
  const blocks = htmlToPlainTextBlocks(data.bodyHtml);
  const signatureSrc = data.signatureImageBase64.startsWith("data:")
    ? data.signatureImageBase64
    : `data:image/png;base64,${data.signatureImageBase64}`;

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <View>
            <Text style={styles.company}>{data.companyName}</Text>
            <Text style={styles.title}>{data.contractTitle}</Text>
            <Text style={styles.meta}>
              Version {data.contractVersion} · {data.contractType.replace(/_/g, " ")}
            </Text>
          </View>
          {data.logoDataUrl ? <Image src={data.logoDataUrl} style={styles.logo} /> : null}
        </View>

        <View>
          {blocks.map((line, i) => (
            <Text key={`${i}-${line.slice(0, 24)}`} style={styles.bodyLine}>
              {line}
            </Text>
          ))}
        </View>

        {data.declarationLines && data.declarationLines.length > 0 ? (
          <View style={styles.declarationBox} wrap={false}>
            <Text style={styles.auditTitle}>{data.declarationTitle ?? "Declaration"}</Text>
            {data.declarationLines.map((line, i) => (
              <Text key={`decl-${i}`} style={styles.declarationLine}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.signSection}>
          <Text style={styles.signLabel}>Electronic signature</Text>
          <Image src={signatureSrc} style={styles.signatureImage} />
          <Text style={styles.signerName}>{data.signerFullName}</Text>
          <Text style={styles.meta}>{data.signerEmail}</Text>
          <Text style={styles.meta}>Signed {formatSignedAt(data.signedAt)}</Text>
        </View>

        <View style={styles.auditBox}>
          <Text style={styles.auditTitle}>Signature audit log</Text>
          <Text style={styles.auditRow}>Signer: {data.signerFullName}</Text>
          <Text style={styles.auditRow}>Email: {data.signerEmail}</Text>
          <Text style={styles.auditRow}>Signed at (UTC): {formatSignedAt(data.signedAt)}</Text>
          <Text style={styles.auditRow}>IP address: {data.signerIp ?? "—"}</Text>
          <Text style={styles.auditRow}>Device: {data.deviceInfo ?? "—"}</Text>
          <Text style={styles.auditRow}>Contract version ID: {data.contractVersionId}</Text>
        </View>
      </Page>
    </Document>
  );
}
