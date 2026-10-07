export function Msg({ m }) {
  return m ? <div className={`msg ${m.type}`}>{m.text}</div> : null;
}
