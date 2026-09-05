<?php

namespace {{namespace}}\Http\Permissions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The permission_callback every admin-facing route points at. One place
 * to change what "can use this extension" means.
 */
class Rest {

	public static function check_permission(): bool {
		return current_user_can( 'manage_woocommerce' );
	}
}
