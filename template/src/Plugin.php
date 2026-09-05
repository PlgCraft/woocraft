<?php

namespace {{namespace}};

use {{namespace}}\Admin\AdminMenu;
use {{namespace}}\Bootstrap\Lifecycle;
use {{namespace}}\Http\Routes;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The single entry point plugin.php calls on plugins_loaded, and the
 * composition root: everything the extension wires together is built
 * here, in one place.
 */
class Plugin {

	private static ?Plugin $instance = null;

	public static function boot(): void {
		if ( null !== Lifecycle::check_environment() ) {
			add_action( 'admin_notices', array( Lifecycle::class, 'print_environment_notice' ) );
			return;
		}

		self::instance();
	}

	public static function instance(): Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		new Routes();

		if ( is_admin() ) {
			new AdminMenu();
		}
	}

	private function __clone() {}

	public function __wakeup() {
		throw new \Exception( 'Cannot unserialize a singleton.' );
	}
}
