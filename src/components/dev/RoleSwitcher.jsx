const roles = [
  ["normal_user", "User"],
  ["client", "Client"],
  ["coach", "Coach"],
  ["admin", "Admin"]
];

export function RoleSwitcher({ currentRole, onRoleChange }) {
  return (
    <select
      aria-label="Preview role"
      className="role-switcher"
      onChange={(event) => onRoleChange(event.target.value)}
      value={currentRole}
    >
      {roles.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
