<?php

namespace {{namespace}}\Http\Routes;

use {{namespace}}\Http\Permissions\Rest;
use WP_REST_Request;

use const {{namespace}}\API_ENDPOINT;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The starter route. Takes a `message` parameter and echoes it back
 * wrapped in a greeting: GET /wp-json/{{apiNamespace}}/hello?message=world
 * returns { "greeting": "Hello world" }.
 *
 * Replace this with the extension's real endpoints - the pattern to keep
 * is the shape: a small class constructed from Http\Routes, gated by
 * Http\Permissions\Rest, with args declared for sanitisation.
 */
class Hello {

	public function __construct() {
		register_rest_route(
			API_ENDPOINT,
			'/hello',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'greet' ),
				'permission_callback' => array( Rest::class, 'check_permission' ),
				'args'                => array(
					'message' => array(
						'required'          => false,
						'default'           => 'world',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);
	}

	public function greet( WP_REST_Request $request ) {
		$message = $request->get_param( 'message' );

		return rest_ensure_response(
			array(
				/* translators: %s: the caller-supplied message */
				'greeting' => sprintf( __( 'Hello %s', '{{textDomain}}' ), $message ),
			)
		);
	}
}
