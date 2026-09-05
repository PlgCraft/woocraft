<?php
/**
 * Fires only when the plugin is deleted from wp-admin (not on
 * deactivation). Intentionally empty - no destructive cleanup is
 * performed automatically. If a "delete all {{name}} data" option is
 * ever added, it belongs here, gated behind an explicit opt-in.
 *
 * @package {{namespace}}
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
