CREATE TYPE "public"."amenity_type" AS ENUM('bathroom', 'drinking_water', 'lights', 'parking', 'spectator_area', 'onsite_shop', 'equipment_rentals');--> statement-breakpoint
CREATE TYPE "public"."helmets_policy" AS ENUM('none_posted', 'recommended', 'required_under_12', 'required_all_ages');--> statement-breakpoint
CREATE TYPE "public"."link_type" AS ENUM('website', 'instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'gofundme', 'venmo', 'patreon', 'donate', 'givebutter', 'paypal', 'other');--> statement-breakpoint
CREATE TYPE "public"."obstacle_type" AS ENUM('grind_box_ledge', 'quarter_pipe', 'flat_rail', 'bank_wedge', 'hubba', 'manual_pad', 'funbox', 'hip', 'handrail', 'curb', 'pyramid', 'kicker_launch_ramp', 'stair', 'wallride', 'mini_ramp', 'spine', 'euro_london_gap', 'pool_bowl', 'extension', 'gap', 'roll_in', 'volcano', 'jersey_barrier', 'a_frame', 'amoeba_pool', 'box_jump', 'picnic_table', 'pole', 'rainbow_rail', 'escalator', 'full_pipe', 'cradle_over_vert', 'snake_run', 'fire_hydrant', 'whoop_dee_doo', 'foam_pit', 'mega_ramp', 'pump_track');--> statement-breakpoint
CREATE TYPE "public"."park_status" AS ENUM('open', 'temporarily_closed', 'permanently_closed');--> statement-breakpoint
CREATE TYPE "public"."park_type" AS ENUM('concrete_park', 'diy_park', 'indoor_park', 'prefab_park', 'skate_plaza');--> statement-breakpoint
CREATE TYPE "public"."riding_surface" AS ENUM('concrete', 'asphalt', 'wood', 'other');--> statement-breakpoint
CREATE TABLE "builders" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"logo_path" text,
	"wp_post_id" integer,
	CONSTRAINT "builders_name_unique" UNIQUE("name"),
	CONSTRAINT "builders_wp_post_id_unique" UNIQUE("wp_post_id")
);
--> statement-breakpoint
CREATE TABLE "park_amenities" (
	"park_id" integer NOT NULL,
	"type" "amenity_type" NOT NULL,
	"present" boolean DEFAULT false NOT NULL,
	"notes" text,
	"photo_path" text,
	CONSTRAINT "park_amenities_park_id_type_pk" PRIMARY KEY("park_id","type")
);
--> statement-breakpoint
CREATE TABLE "park_builders" (
	"park_id" integer NOT NULL,
	"builder_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "park_builders_park_id_builder_id_pk" PRIMARY KEY("park_id","builder_id")
);
--> statement-breakpoint
CREATE TABLE "park_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"park_id" integer NOT NULL,
	"type" "link_type" NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "park_obstacles" (
	"park_id" integer NOT NULL,
	"obstacle" "obstacle_type" NOT NULL,
	CONSTRAINT "park_obstacles_park_id_obstacle_pk" PRIMARY KEY("park_id","obstacle")
);
--> statement-breakpoint
CREATE TABLE "park_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"park_id" integer NOT NULL,
	"storage_path" text NOT NULL,
	"credit" text,
	"caption" text,
	"alt_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "park_renovations" (
	"id" serial PRIMARY KEY NOT NULL,
	"park_id" integer NOT NULL,
	"year" integer NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "park_riding_surfaces" (
	"park_id" integer NOT NULL,
	"surface" "riding_surface" NOT NULL,
	CONSTRAINT "park_riding_surfaces_park_id_surface_pk" PRIMARY KEY("park_id","surface")
);
--> statement-breakpoint
CREATE TABLE "parks" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "park_status" DEFAULT 'open' NOT NULL,
	"city" text NOT NULL,
	"state" text DEFAULT 'PA' NOT NULL,
	"established_year" integer,
	"park_type" "park_type",
	"square_footage" integer,
	"county" text,
	"street_address" text,
	"zip" text,
	"lat" double precision,
	"lng" double precision,
	"hours" text,
	"description" text,
	"allows_skateboards" boolean DEFAULT true NOT NULL,
	"allows_bikes" boolean DEFAULT true NOT NULL,
	"allows_roller_skates" boolean DEFAULT true NOT NULL,
	"allows_scooters" boolean DEFAULT true NOT NULL,
	"vehicle_rules_notes" text,
	"helmets" "helmets_policy" DEFAULT 'none_posted',
	"other_pads_required" boolean DEFAULT false,
	"fee" boolean DEFAULT false,
	"programming" boolean DEFAULT false,
	"riding_surface_notes" text,
	"riding_surface_photo_path" text,
	"status_changed_at" timestamp with time zone,
	"reopen_expected_at" date,
	"wp_post_id" integer,
	"last_revalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parks_slug_unique" UNIQUE("slug"),
	CONSTRAINT "parks_wp_post_id_unique" UNIQUE("wp_post_id")
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"logo_path" text,
	"address" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"state" text DEFAULT 'PA' NOT NULL,
	"wp_post_id" integer,
	CONSTRAINT "shops_wp_post_id_unique" UNIQUE("wp_post_id")
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"park_id" integer NOT NULL,
	"submitter_name" text,
	"submitter_email" text,
	"change_description" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'new' NOT NULL,
	"submitter_ip_truncated" "cidr",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "park_amenities" ADD CONSTRAINT "park_amenities_park_id_parks_id_fk" FOREIGN KEY ("park_id") REFERENCES "public"."parks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "park_builders" ADD CONSTRAINT "park_builders_park_id_parks_id_fk" FOREIGN KEY ("park_id") REFERENCES "public"."parks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "park_builders" ADD CONSTRAINT "park_builders_builder_id_builders_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "park_links" ADD CONSTRAINT "park_links_park_id_parks_id_fk" FOREIGN KEY ("park_id") REFERENCES "public"."parks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "park_obstacles" ADD CONSTRAINT "park_obstacles_park_id_parks_id_fk" FOREIGN KEY ("park_id") REFERENCES "public"."parks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "park_photos" ADD CONSTRAINT "park_photos_park_id_parks_id_fk" FOREIGN KEY ("park_id") REFERENCES "public"."parks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "park_renovations" ADD CONSTRAINT "park_renovations_park_id_parks_id_fk" FOREIGN KEY ("park_id") REFERENCES "public"."parks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "park_riding_surfaces" ADD CONSTRAINT "park_riding_surfaces_park_id_parks_id_fk" FOREIGN KEY ("park_id") REFERENCES "public"."parks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_park_id_parks_id_fk" FOREIGN KEY ("park_id") REFERENCES "public"."parks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "park_amenities_park_idx" ON "park_amenities" USING btree ("park_id");--> statement-breakpoint
CREATE INDEX "park_links_park_idx" ON "park_links" USING btree ("park_id","sort_order");--> statement-breakpoint
CREATE INDEX "park_photos_park_idx" ON "park_photos" USING btree ("park_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "parks_slug_idx" ON "parks" USING btree ("slug");