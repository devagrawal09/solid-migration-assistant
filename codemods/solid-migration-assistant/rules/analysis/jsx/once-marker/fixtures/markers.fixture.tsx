export function Field(props: { initial: string; label: string; onSave: () => void }) {
  return (
    <label title={/*@once*/ props.label}>
      <input value={/* @once */ props.initial} />
      <Button onClick={/*@once*/ props.onSave} />
      {/* once, but not the marker */ props.label}
      {/*@once*/}
    </label>
  );
}

function Button(props: { onClick: () => void }) {
  return <button onClick={props.onClick} />;
}
