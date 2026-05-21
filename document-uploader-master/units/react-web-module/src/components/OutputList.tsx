import type { DocumentOutput } from "../types.js";

interface Props {
  outputs: DocumentOutput[];
}

/**
 * Output set rendered as a flat list. MVP exposes type + an opaque s3Key;
 * download URL generation is the host application's responsibility (or a
 * follow-on `Document.outputs.downloadUrl` field in the API).
 */
export function OutputList({ outputs }: Props) {
  return (
    <ul className="docuploader-outputs">
      {outputs.map((o, i) => (
        <li key={`${o.type}-${i}`}>
          <span>{o.type}</span>
          {o.nativeTrigger === "SLIPSHEET" ? <span className="badge"> SLIPSHEET</span> : null}
          <code>{o.s3Key}</code>
        </li>
      ))}
    </ul>
  );
}
