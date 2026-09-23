# Additions to the existing VPC: private subnets for tasks, and one NAT gateway
# so every task reaches Atlas from a single allowlisted IP (D4, D18, D22).

resource "aws_subnet" "private" {
  for_each = var.private_subnets

  vpc_id                  = var.vpc_id
  availability_zone       = each.key
  cidr_block              = each.value
  map_public_ip_on_launch = false

  tags = {
    Name = "${var.name}-private-${each.key}"
    Tier = "private"
  }
}

# This address is on the Atlas network access list. Replacing it silently cuts
# every task off from the database, so Terraform refuses to destroy it.
resource "aws_eip" "nat" {
  count = var.create_nat_gateway ? 1 : 0

  domain = "vpc"

  tags = {
    Name = "${var.name}-nat"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_nat_gateway" "this" {
  count = var.create_nat_gateway ? 1 : 0

  allocation_id = aws_eip.nat[0].id
  subnet_id     = var.nat_public_subnet_id

  # Deliberately the repository name rather than var.name, unlike every other
  # resource here: the NAT is named after the app it serves, not the environment.
  tags = {
    Name = var.ecr_repository_name
  }

  lifecycle {
    precondition {
      condition     = var.nat_public_subnet_id != null
      error_message = "nat_public_subnet_id is required when create_nat_gateway is true."
    }
  }
}

locals {
  # Either this environment's own NAT gateway, or one it borrows (D40).
  nat_gateway_id = var.create_nat_gateway ? one(aws_nat_gateway.this[*].id) : var.nat_gateway_id
}

resource "aws_route_table" "private" {
  vpc_id = var.vpc_id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = local.nat_gateway_id
  }

  tags = {
    Name = "${var.name}-private"
  }
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private

  # A route table pointing nowhere would leave tasks unable to reach the
  # database, the image registry or the secret.
  lifecycle {
    precondition {
      condition     = local.nat_gateway_id != null
      error_message = "Set create_nat_gateway, or pass nat_gateway_id to reuse an existing one."
    }
  }


  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}
