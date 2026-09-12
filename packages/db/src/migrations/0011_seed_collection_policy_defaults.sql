INSERT INTO `collection_policy_revision` (
	`id`,
	`installation_id`,
	`scope`,
	`site_id`,
	`version`,
	`policy_json`,
	`effective_from`,
	`effective_to`,
	`committed_at`,
	`created_by`,
	`created_at`
)
SELECT
	'cpr_bootstrap_' || installation.`id` || '_' || CAST(COALESCE((
		SELECT MAX(previous.`version`) + 1
		FROM `collection_policy_revision` AS previous
		WHERE previous.`installation_id` = installation.`id`
		  AND previous.`scope` = 'installation'
	), 1) AS TEXT),
	installation.`id`,
	'installation',
	NULL,
	COALESCE((
		SELECT MAX(previous.`version`) + 1
		FROM `collection_policy_revision` AS previous
		WHERE previous.`installation_id` = installation.`id`
		  AND previous.`scope` = 'installation'
	), 1),
	'{"anonymousCollection":"enabled","honorGpcDnt":true,"consentMode":"required_for_identity","botPolicy":"exclude","captureQueryStrings":false,"urlPolicy":{"capturePath":true,"captureReferrer":true,"stripQueryStrings":true,"stripSensitiveValues":true},"propertyPolicy":{"allowScalarProperties":true,"maxProperties":64,"maxValueLength":512,"reservedNames":[]},"profileFilterKeys":[],"exclusions":{"hostnames":[],"paths":[],"countries":[],"ipRanges":[]}}',
	installation.`created_at`,
	NULL,
	installation.`created_at`,
	NULL,
	installation.`created_at`
FROM `installation` AS installation
WHERE NOT EXISTS (
	SELECT 1
	FROM `collection_policy_revision` AS current_policy
	WHERE current_policy.`installation_id` = installation.`id`
	  AND current_policy.`scope` = 'installation'
	  AND current_policy.`effective_to` IS NULL
);
