# Internet reaches the ALB only; only the ALB reaches tasks, and only on 3000 (D19).

resource "aws_security_group" "alb" {
  count = var.create_load_balancer ? 1 : 0

  name        = "${var.name}-alb"
  description = "Kimply ALB: public HTTP and HTTPS"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.name}-alb"
  }
}

resource "aws_security_group" "task" {
  name        = "${var.name}-task"
  description = "Kimply tasks: port 3000 from the ALB only"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.name}-task"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  count = var.create_load_balancer ? 1 : 0

  security_group_id = aws_security_group.alb[0].id
  description       = "HTTP, redirected to HTTPS"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  count = var.create_load_balancer ? 1 : 0

  security_group_id = aws_security_group.alb[0].id
  description       = "HTTPS"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

# When the load balancer is shared, its owner's group already allows egress to
# port 3000; this rule adds the borrower's tasks as a destination.
resource "aws_vpc_security_group_egress_rule" "alb_to_task" {
  security_group_id            = local.alb_security_group_id
  description                  = "Forward to tasks and health-check them"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.task.id
}

resource "aws_vpc_security_group_ingress_rule" "task_from_alb" {
  security_group_id            = aws_security_group.task.id
  description                  = "App traffic from the ALB only"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = local.alb_security_group_id
}

# Allow-all egress (D20). Tasks need Atlas on 27017 and AWS APIs on 443, and a
# narrower rule fails confusingly the day a new dependency uses another port.
resource "aws_vpc_security_group_egress_rule" "task_all" {
  security_group_id = aws_security_group.task.id
  description       = "All outbound, through the NAT gateway"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
