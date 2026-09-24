-- Local database operator can explicitly assume the maintenance role.
-- No application or authenticated role receives this membership.
grant skolplattform_audit_maintenance to postgres;
